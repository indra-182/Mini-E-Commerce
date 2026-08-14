import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
  getSchemaPath
} from "@nestjs/swagger";
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res
} from "@nestjs/common";
import { IsIn, IsInt, IsString, IsUUID, Min } from "class-validator";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Response } from "express";

import {
  OrderDto,
  PaymentAttemptDto,
  ShippingAddressDto,
  canonicalJson,
  databaseNow,
  lockOrder,
  markPaymentAttemptSetupFailed,
  orderSelect,
  paymentAttemptSelect,
  paymentGatewayUnavailable,
  reconcileExpiredOrders,
  toOrder,
  toPaymentAttempt,
  type OrderRecord,
  type PaymentAttemptRecord
} from "../order/order.js";
import { GuestSessionService } from "../common/guest-session.js";
import { ProblemDetailsDto, ProblemException } from "../common/problem-details.js";
import type { RequestWithContext } from "../common/request-context.js";
import { APP_ENVIRONMENT, type AppEnvironment } from "../config/environment.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { createValidationPipe } from "../common/validation.js";
import {
  PAYMENT_GATEWAY,
  type FakePaymentOutcome,
  type PaymentGateway,
  verifyFakePaymentWebhookSignature
} from "./payment-gateway.js";

const FAKE_PAYMENT_EVENT_TYPES = ["PAYMENT_SUCCEEDED", "PAYMENT_FAILED"] as const;
type FakePaymentEventType = (typeof FAKE_PAYMENT_EVENT_TYPES)[number];

type FakePaymentWebhookPayload = {
  eventType: FakePaymentEventType;
  paymentAttemptId: string;
  providerReference: string;
  amount: number;
  currency: "IDR";
};

type WebhookHeaders = {
  providerEventId: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
};

export class FakePaymentOutcomeDto {
  @ApiProperty({ type: String, enum: ["SUCCEEDED", "FAILED", "PENDING"], example: "SUCCEEDED" })
  @IsIn(["SUCCEEDED", "FAILED", "PENDING"])
  outcome!: FakePaymentOutcome | "PENDING";
}

export class FakePaymentWebhookDto {
  @ApiProperty({ type: String, enum: FAKE_PAYMENT_EVENT_TYPES, example: "PAYMENT_SUCCEEDED" })
  @IsIn(FAKE_PAYMENT_EVENT_TYPES)
  eventType!: FakePaymentEventType;

  @ApiProperty({ type: String, format: "uuid" })
  @IsUUID()
  paymentAttemptId!: string;

  @ApiProperty({ type: String, example: "provider-reference" })
  @IsString()
  providerReference!: string;

  @ApiProperty({ type: "integer", minimum: 0, example: 170000 })
  @IsInt()
  @Min(0)
  amount!: number;

  @ApiProperty({ type: String, enum: ["IDR"], example: "IDR" })
  @IsIn(["IDR"])
  currency!: "IDR";
}

export class WebhookAcknowledgementDto {
  @ApiProperty({ type: Boolean, example: true })
  acknowledged!: true;
}

const orderForAttemptSelect = {
  ...orderSelect,
  paymentAttempts: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, status: true }
  }
} satisfies Prisma.OrderSelect;

const paymentAttemptWithOrderIdSelect = {
  ...paymentAttemptSelect,
  orderId: true
} satisfies Prisma.PaymentAttemptSelect;

function guestSessionRequired(): never {
  throw new ProblemException({
    status: HttpStatus.UNAUTHORIZED,
    code: "GUEST_SESSION_REQUIRED",
    detail: "A valid guest session is required."
  });
}

function orderNotFound(): never {
  throw new ProblemException({
    status: HttpStatus.NOT_FOUND,
    code: "ORDER_NOT_FOUND",
    detail: "The requested Order was not found."
  });
}

function invalidOrderTransition(detail: string): never {
  throw new ProblemException({
    status: HttpStatus.CONFLICT,
    code: "INVALID_ORDER_TRANSITION",
    detail
  });
}

function invalidWebhook(detail = "The fake payment webhook could not be verified."): never {
  throw new ProblemException({
    status: HttpStatus.BAD_REQUEST,
    code: "MALFORMED_REQUEST",
    detail
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isVisibleAscii(value: unknown, maxLength = 128): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= maxLength && /^[\x21-\x7E]+$/.test(value);
}

function parseWebhookPayload(rawBody: Buffer): FakePaymentWebhookPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString("utf8")) as unknown;
  } catch {
    invalidWebhook("The fake payment webhook body is not valid JSON.");
  }

  if (!isRecord(parsed)) invalidWebhook("The fake payment webhook body is invalid.");
  const keys = Object.keys(parsed).sort();
  const expectedKeys = ["amount", "currency", "eventType", "paymentAttemptId", "providerReference"];
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    invalidWebhook("The fake payment webhook body contains unexpected fields.");
  }

  const eventType = parsed.eventType;
  const paymentAttemptId = parsed.paymentAttemptId;
  const providerReference = parsed.providerReference;
  const amount = parsed.amount;
  const currency = parsed.currency;
  if (!FAKE_PAYMENT_EVENT_TYPES.includes(eventType as FakePaymentEventType)) invalidWebhook("The fake payment webhook event type is invalid.");
  if (!isUuid(paymentAttemptId)) invalidWebhook("The fake payment webhook Payment Attempt is invalid.");
  if (!isVisibleAscii(providerReference)) invalidWebhook("The fake payment webhook provider reference is invalid.");
  if (!Number.isSafeInteger(amount) || (amount as number) < 0) invalidWebhook("The fake payment webhook amount is invalid.");
  if (currency !== "IDR") invalidWebhook("The fake payment webhook currency is invalid.");

  return {
    eventType: eventType as FakePaymentEventType,
    paymentAttemptId,
    providerReference,
    amount: amount as number,
    currency
  };
}

function requireWebhookHeader(value: string | undefined, name: string): string {
  if (!isVisibleAscii(value)) invalidWebhook(`The ${name} header is required.`);
  return value;
}

async function expireLockedOrder(transaction: Prisma.TransactionClient, order: OrderRecord, now: Date): Promise<boolean> {
  if (order.status !== "AWAITING_PAYMENT" || order.expiresAt.getTime() > now.getTime()) return false;

  const transitioned = await transaction.order.updateMany({
    where: { id: order.id, status: "AWAITING_PAYMENT", expiresAt: { lte: now } },
    data: { status: "EXPIRED" }
  });
  if (transitioned.count !== 1) return false;

  await transaction.paymentAttempt.updateMany({
    where: { orderId: order.id, status: "PENDING" },
    data: { status: "EXPIRED" }
  });
  for (const item of order.items) {
    await transaction.productVariant.update({
      where: { id: item.productVariantId },
      data: { availableQuantity: { increment: item.quantity } }
    });
  }
  return true;
}

@Injectable()
export class PaymentService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GuestSessionService) private readonly sessions: GuestSessionService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(APP_ENVIRONMENT) private readonly environment: AppEnvironment
  ) {}

  async createAttempt(cookieHeader: string | undefined, orderId: string): Promise<PaymentAttemptDto> {
    const guestSessionId = await this.requireSession(cookieHeader);
    const attempt = await this.prisma.$transaction(async (transaction) => {
      const now = await databaseNow(transaction);
      await reconcileExpiredOrders(transaction, now);
      await lockOrder(transaction, orderId);

      const order = await transaction.order.findFirst({ where: { id: orderId, guestSessionId }, select: orderForAttemptSelect });
      if (!order) orderNotFound();
      if (order.status !== "AWAITING_PAYMENT" || order.expiresAt.getTime() <= now.getTime()) {
        invalidOrderTransition("Payment Attempts can only be created for an unexpired awaiting-payment Order.");
      }
      if (order.paymentAttempts.some((paymentAttempt) => paymentAttempt.status === "PENDING")) {
        invalidOrderTransition("The current Payment Attempt is still pending.");
      }

      return transaction.paymentAttempt.create({
        data: {
          orderId,
          providerReference: randomUUID(),
          amount: order.grandTotal,
          currency: order.currency,
          expiresAt: order.expiresAt
        },
        select: paymentAttemptSelect
      });
    });

    try {
      await this.gateway.createPaymentSession(toPaymentAttempt(attempt));
    } catch {
      const failed = await markPaymentAttemptSetupFailed(this.prisma, guestSessionId, orderId, attempt.id);
      if (failed) paymentGatewayUnavailable(failed.order, failed.paymentAttempt);
      throw new ProblemException({
        status: HttpStatus.BAD_GATEWAY,
        code: "PAYMENT_GATEWAY_UNAVAILABLE",
        detail: "The payment provider is unavailable. Retry the Payment Attempt."
      });
    }

    return toPaymentAttempt(attempt);
  }

  async simulateOutcome(
    cookieHeader: string | undefined,
    paymentAttemptId: string,
    outcome: FakePaymentOutcome | "PENDING"
  ): Promise<PaymentAttemptDto> {
    const guestSessionId = await this.requireSession(cookieHeader);
    const attempt = await this.findOwnedPendingAttempt(guestSessionId, paymentAttemptId);
    const dto = toPaymentAttempt(attempt);
    if (outcome === "PENDING") return dto;

    const signedWebhook = this.gateway.createOutcomeWebhook(dto, outcome);
    await this.processWebhook(signedWebhook.rawBody, {
      providerEventId: signedWebhook.providerEventId,
      timestamp: signedWebhook.timestamp,
      signature: signedWebhook.signature
    });

    const updated = await this.prisma.paymentAttempt.findFirst({
      where: { id: paymentAttemptId, order: { guestSessionId } },
      select: paymentAttemptSelect
    });
    if (!updated) orderNotFound();
    return toPaymentAttempt(updated);
  }

  async processWebhook(rawBody: Buffer | undefined, headers: WebhookHeaders): Promise<WebhookAcknowledgementDto> {
    if (!rawBody) invalidWebhook("The fake payment webhook body is required.");
    const providerEventId = requireWebhookHeader(headers.providerEventId, "X-Fake-Event-Id");
    const timestamp = requireWebhookHeader(headers.timestamp, "X-Fake-Timestamp");
    const signature = requireWebhookHeader(headers.signature, "X-Fake-Signature");
    if (!verifyFakePaymentWebhookSignature(this.environment.fakePaymentWebhookSecret, timestamp, rawBody, signature)) {
      invalidWebhook();
    }
    const payload = parseWebhookPayload(rawBody);

    await this.prisma.$transaction(async (transaction) => {
      const linkedAttempt = await transaction.paymentAttempt.findUnique({
        where: { id: payload.paymentAttemptId },
        select: paymentAttemptWithOrderIdSelect
      });
      if (!linkedAttempt || linkedAttempt.providerReference !== payload.providerReference) {
        invalidWebhook("The fake payment webhook Payment Attempt could not be mapped.");
      }

      await lockOrder(transaction, linkedAttempt.orderId);
      const now = await databaseNow(transaction);
      const order = await transaction.order.findUnique({ where: { id: linkedAttempt.orderId }, select: orderSelect });
      if (!order) invalidWebhook("The fake payment webhook Order could not be mapped.");

      const existing = await transaction.webhookEvent.findUnique({
        where: { providerEventId },
        select: { payload: true }
      });
      if (existing) {
        if (canonicalJson(existing.payload) !== canonicalJson(payload)) {
          invalidWebhook("The provider event ID was already used with a different payload.");
        }
        return;
      }

      if (linkedAttempt.amount !== payload.amount || linkedAttempt.currency !== payload.currency) {
        invalidWebhook("The fake payment amount or currency does not match the Payment Attempt.");
      }

      const inserted = await transaction.webhookEvent.createMany({
        data: {
          providerEventId,
          eventType: payload.eventType,
          payload: payload as unknown as Prisma.InputJsonValue
        },
        skipDuplicates: true
      });
      if (inserted.count === 0) {
        const raced = await transaction.webhookEvent.findUniqueOrThrow({ where: { providerEventId }, select: { payload: true } });
        if (canonicalJson(raced.payload) !== canonicalJson(payload)) {
          invalidWebhook("The provider event ID was already used with a different payload.");
        }
        return;
      }

      const expired = await expireLockedOrder(transaction, order, now);
      const currentAttempt = await transaction.paymentAttempt.findUniqueOrThrow({
        where: { id: linkedAttempt.id },
        select: paymentAttemptSelect
      });

      if (!expired && order.status === "AWAITING_PAYMENT" && currentAttempt.status === "PENDING") {
        if (payload.eventType === "PAYMENT_FAILED") {
          await transaction.paymentAttempt.updateMany({
            where: { id: currentAttempt.id, status: "PENDING" },
            data: { status: "FAILED" }
          });
        } else {
          const paid = await transaction.order.updateMany({
            where: { id: order.id, status: "AWAITING_PAYMENT", expiresAt: { gt: now } },
            data: { status: "PAID" }
          });
          if (paid.count === 1) {
            await transaction.paymentAttempt.updateMany({
              where: { id: currentAttempt.id, status: "PENDING" },
              data: { status: "SUCCEEDED" }
            });
          }
        }
      }
    });

    return { acknowledged: true };
  }

  private async requireSession(cookieHeader: string | undefined): Promise<string> {
    const sessionId = await this.sessions.findSessionId(cookieHeader);
    if (!sessionId) guestSessionRequired();
    return sessionId;
  }

  private async findOwnedPendingAttempt(guestSessionId: string, paymentAttemptId: string): Promise<PaymentAttemptRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const linkedAttempt = await transaction.paymentAttempt.findFirst({
        where: { id: paymentAttemptId, order: { guestSessionId } },
        select: paymentAttemptWithOrderIdSelect
      });
      if (!linkedAttempt) orderNotFound();

      await lockOrder(transaction, linkedAttempt.orderId);
      const now = await databaseNow(transaction);
      await reconcileExpiredOrders(transaction, now);
      const order = await transaction.order.findFirst({ where: { id: linkedAttempt.orderId, guestSessionId }, select: orderSelect });
      if (!order) orderNotFound();
      if (order.status !== "AWAITING_PAYMENT" || order.expiresAt.getTime() <= now.getTime()) {
        invalidOrderTransition("Payment outcomes can only be submitted for an unexpired awaiting-payment Order.");
      }

      const attempt = await transaction.paymentAttempt.findUniqueOrThrow({ where: { id: paymentAttemptId }, select: paymentAttemptSelect });
      if (attempt.status !== "PENDING") invalidOrderTransition("Only a pending Payment Attempt can receive an outcome.");
      return attempt;
    });
  }

}

@ApiExtraModels(ProblemDetailsDto, OrderDto, ShippingAddressDto, PaymentAttemptDto, FakePaymentOutcomeDto, FakePaymentWebhookDto, WebhookAcknowledgementDto)
@ApiTags("Payments")
@Controller()
export class PaymentController {
  constructor(@Inject(PaymentService) private readonly payments: PaymentService) {}

  @Post("orders/:orderId/payment-attempts")
  @ApiCookieAuth("guest_session")
  @ApiOperation({ operationId: "payments_createAttempt", summary: "Create a retry Payment Attempt for an Order" })
  @ApiParam({ name: "orderId", type: String, format: "uuid" })
  @ApiCreatedResponse({ type: PaymentAttemptDto })
  @ApiResponse({ status: HttpStatus.CONFLICT, content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } } })
  @ApiResponse({ status: HttpStatus.BAD_GATEWAY, content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } } })
  createAttempt(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @Res({ passthrough: true }) response: Response
  ): Promise<PaymentAttemptDto> {
    response.setHeader("Cache-Control", "no-store");
    return this.payments.createAttempt(cookieHeader, orderId);
  }

  @Post("fake-payments/:paymentAttemptId/outcome")
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth("guest_session")
  @ApiOperation({ operationId: "fakePayments_submitOutcome", summary: "Simulate a fake payment outcome" })
  @ApiParam({ name: "paymentAttemptId", type: String, format: "uuid" })
  @ApiOkResponse({ type: PaymentAttemptDto })
  @ApiResponse({ status: HttpStatus.CONFLICT, content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } } })
  submitOutcome(
    @Headers("cookie") cookieHeader: string | undefined,
    @Param("paymentAttemptId", new ParseUUIDPipe()) paymentAttemptId: string,
    @Body(createValidationPipe(FakePaymentOutcomeDto)) input: FakePaymentOutcomeDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<PaymentAttemptDto> {
    response.setHeader("Cache-Control", "no-store");
    return this.payments.simulateOutcome(cookieHeader, paymentAttemptId, input.outcome);
  }

  @Post("webhooks/fake-payment")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "fakePayments_receiveWebhook", summary: "Receive a signed fake payment webhook" })
  @ApiHeader({ name: "X-Fake-Event-Id", required: true })
  @ApiHeader({ name: "X-Fake-Timestamp", required: true })
  @ApiHeader({ name: "X-Fake-Signature", required: true })
  @ApiBody({ type: FakePaymentWebhookDto })
  @ApiOkResponse({ type: WebhookAcknowledgementDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } } })
  receiveWebhook(
    @Headers("x-fake-event-id") providerEventId: string | undefined,
    @Headers("x-fake-timestamp") timestamp: string | undefined,
    @Headers("x-fake-signature") signature: string | undefined,
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response
  ): Promise<WebhookAcknowledgementDto> {
    response.setHeader("Cache-Control", "no-store");
    return this.payments.processWebhook(request.rawBody, { providerEventId, timestamp, signature });
  }
}
