import { createHash, randomUUID } from "node:crypto";

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Res
} from "@nestjs/common";
import {
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
import { Type } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  Length,
  MaxLength,
  ValidateNested
} from "class-validator";
import { Prisma } from "@prisma/client";
import type { Response } from "express";

import { CartDto, findActiveCart, parseCartVersion, toCart, type CartRecord } from "../cart/cart.js";
import { MoneyDto } from "../catalog/catalog.js";
import { GuestSessionService } from "../common/guest-session.js";
import { ProblemDetailsDto, ProblemException } from "../common/problem-details.js";
import { PAYMENT_GATEWAY, type PaymentGateway } from "../payment/payment-gateway.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { createValidationPipe } from "../common/validation.js";

export const REGULAR_SHIPPING_FEE = 0;
export const ORDER_RESERVATION_MINUTES = 15;

type OrderState = "AWAITING_PAYMENT" | "PAID" | "EXPIRED";

export class CheckoutCustomerDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 100, example: "Ada Lovelace" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ type: String, format: "email", maxLength: 254, example: "ada@example.test" })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class ShippingAddressDto {
  @ApiProperty({ type: String, maxLength: 200, example: "Jl. Contoh 1" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  line1!: string;

  @ApiProperty({ type: String, maxLength: 100, example: "Jakarta" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @ApiProperty({ type: String, minLength: 3, maxLength: 12, example: "10110" })
  @IsString()
  @Length(3, 12)
  postalCode!: string;

  @ApiProperty({ type: String, enum: ["ID"], example: "ID" })
  @IsIn(["ID"])
  countryCode!: "ID";
}

export class CreateOrderDto {
  @ApiProperty({ type: CheckoutCustomerDto })
  @ValidateNested()
  @Type(() => CheckoutCustomerDto)
  customer!: CheckoutCustomerDto;

  @ApiProperty({ type: ShippingAddressDto })
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress!: ShippingAddressDto;

  @ApiProperty({ type: String, enum: ["REGULAR"], example: "REGULAR" })
  @IsIn(["REGULAR"])
  shippingMethod!: "REGULAR";
}

export class OrderItemDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "uuid" })
  productVariantId!: string;

  @ApiProperty({ type: String, example: "KOPI-GAYO-250G" })
  sku!: string;

  @ApiProperty({ type: String, example: "Kopi Arabika Gayo" })
  name!: string;

  @ApiProperty({ type: String, example: "250 g" })
  optionLabel!: string;

  @ApiProperty({ type: MoneyDto, example: { amount: 85000, currency: "IDR" } })
  unitPrice!: MoneyDto;

  @ApiProperty({ type: "integer", minimum: 1, example: 2 })
  quantity!: number;

  @ApiProperty({ type: MoneyDto, example: { amount: 170000, currency: "IDR" } })
  lineTotal!: MoneyDto;
}

export class PaymentAttemptDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, enum: ["PENDING", "SUCCEEDED", "FAILED", "EXPIRED"], example: "PENDING" })
  status!: "PENDING" | "SUCCEEDED" | "FAILED" | "EXPIRED";

  @ApiProperty({ type: String, example: "provider-reference" })
  providerReference!: string;

  @ApiProperty({ type: MoneyDto, example: { amount: 170000, currency: "IDR" } })
  amount!: MoneyDto;

  @ApiProperty({ type: String, format: "date-time" })
  expiresAt!: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;
}

export class OrderDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, enum: ["AWAITING_PAYMENT", "PAID", "EXPIRED"], example: "AWAITING_PAYMENT" })
  status!: OrderState;

  @ApiProperty({ type: String, example: "Ada Lovelace" })
  customerName!: string;

  @ApiProperty({ type: String, format: "email", example: "ada@example.test" })
  customerEmail!: string;

  @ApiProperty({ type: ShippingAddressDto })
  shippingAddress!: ShippingAddressDto;

  @ApiProperty({ type: String, enum: ["REGULAR"], example: "REGULAR" })
  shippingMethod!: "REGULAR";

  @ApiProperty({ type: MoneyDto, example: { amount: 170000, currency: "IDR" } })
  subtotal!: MoneyDto;

  @ApiProperty({ type: MoneyDto, example: { amount: 0, currency: "IDR" } })
  shippingFee!: MoneyDto;

  @ApiProperty({ type: MoneyDto, example: { amount: 170000, currency: "IDR" } })
  grandTotal!: MoneyDto;

  @ApiProperty({ type: String, format: "date-time" })
  expiresAt!: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;

  @ApiProperty({ type: [OrderItemDto] })
  items!: OrderItemDto[];
}

export class OrderWithInitialPaymentAttemptDto extends OrderDto {
  @ApiProperty({ type: PaymentAttemptDto })
  paymentAttempt!: PaymentAttemptDto;
}

export const orderSelect = {
  id: true,
  status: true,
  customerName: true,
  customerEmail: true,
  shippingAddress: true,
  shippingMethod: true,
  subtotal: true,
  shippingFee: true,
  grandTotal: true,
  currency: true,
  expiresAt: true,
  createdAt: true,
  items: {
    orderBy: [{ id: "asc" }],
    select: {
      id: true,
      productVariantId: true,
      skuSnapshot: true,
      nameSnapshot: true,
      optionLabelSnapshot: true,
      unitPrice: true,
      quantity: true,
      lineTotal: true
    }
  }
} satisfies Prisma.OrderSelect;

export const paymentAttemptSelect = {
  id: true,
  status: true,
  providerReference: true,
  amount: true,
  currency: true,
  expiresAt: true,
  createdAt: true
} satisfies Prisma.PaymentAttemptSelect;

export type OrderRecord = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;
export type PaymentAttemptRecord = Prisma.PaymentAttemptGetPayload<{ select: typeof paymentAttemptSelect }>;

export type OrderTotalLine = { unitPrice: number; quantity: number };

export function money(amount: number): MoneyDto {
  return { amount, currency: "IDR" };
}

export function calculateOrderTotals(lines: readonly OrderTotalLine[], shippingFee: number): {
  subtotal: number;
  shippingFee: number;
  grandTotal: number;
} {
  const subtotal = lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
  return { subtotal, shippingFee, grandTotal: subtotal + shippingFee };
}

export function canTransitionOrder(from: OrderState, to: OrderState): boolean {
  return from === "AWAITING_PAYMENT" && (to === "PAID" || to === "EXPIRED");
}

export function canExpireOrder(status: OrderState, expiresAt: Date, databaseNow: Date): boolean {
  return status === "AWAITING_PAYMENT" && expiresAt.getTime() <= databaseNow.getTime();
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
  return `{${entries.join(",")}}`;
}

export function checkoutRequestHash(input: CreateOrderDto): string {
  return createHash("sha256").update(canonicalJson(input), "utf8").digest("hex");
}

function guestSessionRequired(detail = "A valid guest session is required."): never {
  throw new ProblemException({ status: HttpStatus.UNAUTHORIZED, code: "GUEST_SESSION_REQUIRED", detail });
}

function orderNotFound(): never {
  throw new ProblemException({ status: HttpStatus.NOT_FOUND, code: "ORDER_NOT_FOUND", detail: "The requested Order was not found." });
}

function invalidIdempotencyKey(): never {
  throw new ProblemException({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: "VALIDATION_FAILED",
    detail: "Request validation failed.",
    errors: { "Idempotency-Key": ["Idempotency-Key must contain 16 to 128 visible ASCII characters."] }
  });
}

function idempotencyKeyReused(): never {
  throw new ProblemException({
    status: HttpStatus.CONFLICT,
    code: "IDEMPOTENCY_KEY_REUSED",
    detail: "The Idempotency-Key was already used with a different checkout request."
  });
}

function checkoutCartChanged(cart: CartRecord): never {
  throw new ProblemException({
    status: HttpStatus.CONFLICT,
    code: "CHECKOUT_CART_CHANGED",
    detail: "The Cart changed. Refresh it and confirm Checkout again.",
    currentCart: toCart(cart) as unknown as Record<string, unknown>
  });
}

function insufficientStock(): never {
  throw new ProblemException({
    status: HttpStatus.CONFLICT,
    code: "INSUFFICIENT_STOCK",
    detail: "One or more requested Product Variants no longer have enough stock."
  });
}

function emptyCart(): never {
  throw new ProblemException({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: "VALIDATION_FAILED",
    detail: "Request validation failed.",
    errors: { cart: ["Cart must contain at least one Product Variant."] }
  });
}

export function paymentGatewayUnavailable(order: OrderDto, paymentAttempt: PaymentAttemptDto): never {
  throw new ProblemException({
    status: HttpStatus.BAD_GATEWAY,
    code: "PAYMENT_GATEWAY_UNAVAILABLE",
    detail: "The payment provider is unavailable. Retry the Payment Attempt.",
    order: order as unknown as Record<string, unknown>,
    paymentAttempt: paymentAttempt as unknown as Record<string, unknown>
  });
}

export function toPaymentAttempt(record: PaymentAttemptRecord): PaymentAttemptDto {
  return {
    id: record.id,
    status: record.status,
    providerReference: record.providerReference,
    amount: money(record.amount),
    expiresAt: record.expiresAt.toISOString(),
    createdAt: record.createdAt.toISOString()
  };
}

export function toOrder(record: OrderRecord): OrderDto {
  return {
    id: record.id,
    status: record.status,
    customerName: record.customerName,
    customerEmail: record.customerEmail,
    shippingAddress: record.shippingAddress as unknown as ShippingAddressDto,
    shippingMethod: record.shippingMethod,
    subtotal: money(record.subtotal),
    shippingFee: money(record.shippingFee),
    grandTotal: money(record.grandTotal),
    expiresAt: record.expiresAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    items: record.items.map((item) => ({
      id: item.id,
      productVariantId: item.productVariantId,
      sku: item.skuSnapshot,
      name: item.nameSnapshot,
      optionLabel: item.optionLabelSnapshot,
      unitPrice: money(item.unitPrice),
      quantity: item.quantity,
      lineTotal: money(item.lineTotal)
    }))
  };
}

export async function databaseNow(client: Prisma.TransactionClient): Promise<Date> {
  const result = await client.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT CURRENT_TIMESTAMP AS "now"`);
  const now = result[0]?.now;
  if (!(now instanceof Date)) throw new Error("Database time was unavailable.");
  return now;
}

export async function lockOrder(client: Prisma.TransactionClient, orderId: string): Promise<void> {
  await client.$queryRaw(Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = CAST(${orderId} AS uuid) FOR UPDATE`);
}

export async function markPaymentAttemptSetupFailed(
  prisma: PrismaService,
  guestSessionId: string,
  orderId: string,
  paymentAttemptId: string
): Promise<{ order: OrderDto; paymentAttempt: PaymentAttemptDto } | null> {
  return prisma.$transaction(async (transaction) => {
    await lockOrder(transaction, orderId);
    const now = await databaseNow(transaction);
    await reconcileExpiredOrders(transaction, now);

    const order = await transaction.order.findFirst({ where: { id: orderId, guestSessionId }, select: orderSelect });
    const attempt = await transaction.paymentAttempt.findFirst({ where: { id: paymentAttemptId, orderId }, select: paymentAttemptSelect });
    if (!order || !attempt) return null;

    if (order.status === "AWAITING_PAYMENT" && order.expiresAt.getTime() > now.getTime() && attempt.status === "PENDING") {
      await transaction.paymentAttempt.updateMany({
        where: { id: paymentAttemptId, orderId, status: "PENDING" },
        data: { status: "FAILED" }
      });
    }

    const failedAttempt = await transaction.paymentAttempt.findUniqueOrThrow({ where: { id: paymentAttemptId }, select: paymentAttemptSelect });
    return { order: toOrder(order), paymentAttempt: toPaymentAttempt(failedAttempt) };
  });
}

function isCheckoutRetryableConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  if (error.code !== "P2002") return false;
  const target = error.meta?.target;
  return Array.isArray(target) && target.includes("guestSessionId") && target.includes("idempotencyKey");
}

type CheckoutTransactionResult = {
  value: OrderWithInitialPaymentAttemptDto;
  created: boolean;
};

// ponytail: global stale-Order scan per checkout/read; replace with a worker only when order volume requires it.
export async function reconcileExpiredOrders(client: Prisma.TransactionClient, now?: Date): Promise<void> {
  const databaseTime = now ?? (await databaseNow(client));
  const staleOrders = await client.order.findMany({
    where: { status: "AWAITING_PAYMENT", expiresAt: { lte: databaseTime } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      items: {
        orderBy: [{ productVariantId: "asc" }, { id: "asc" }],
        select: { productVariantId: true, quantity: true }
      }
    }
  });

  for (const order of staleOrders) {
    if (!canExpireOrder(order.status, order.expiresAt, databaseTime)) continue;
    const transitioned = await client.order.updateMany({
      where: { id: order.id, status: "AWAITING_PAYMENT", expiresAt: { lte: databaseTime } },
      data: { status: "EXPIRED" }
    });
    if (transitioned.count !== 1) continue;

    await client.paymentAttempt.updateMany({
      where: { orderId: order.id, status: "PENDING" },
      data: { status: "EXPIRED" }
    });

    for (const item of order.items) {
      await client.productVariant.update({
        where: { id: item.productVariantId },
        data: { availableQuantity: { increment: item.quantity } }
      });
    }
  }
}

@Injectable()
export class OrderService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GuestSessionService) private readonly sessions: GuestSessionService,
    @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGateway
  ) {}

  async create(
    cookieHeader: string | undefined,
    ifMatch: string | undefined,
    idempotencyKey: string | undefined,
    input: CreateOrderDto
  ): Promise<OrderWithInitialPaymentAttemptDto> {
    const sessionId = await this.requireSession(cookieHeader);
    if (ifMatch === undefined) {
      throw new ProblemException({
        status: HttpStatus.PRECONDITION_REQUIRED,
        code: "PRECONDITION_REQUIRED",
        detail: "If-Match is required for Checkout."
      });
    }
    if (idempotencyKey === undefined || !/^[\x21-\x7E]{16,128}$/.test(idempotencyKey)) invalidIdempotencyKey();

    const expectedVersion = parseCartVersion(ifMatch);
    const requestHash = checkoutRequestHash(input);
    let transactionResult: CheckoutTransactionResult | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        transactionResult = await this.prisma.$transaction(
          (transaction) => this.createInTransaction(transaction, sessionId, expectedVersion, idempotencyKey, requestHash, input),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
        break;
      } catch (error) {
        if (!isCheckoutRetryableConflict(error) || attempt === 2) throw error;
      }
    }

    if (!transactionResult) throw new Error("Checkout transaction retry limit reached.");
    if (!transactionResult.created) return transactionResult.value;

    try {
      await this.paymentGateway.createPaymentSession(transactionResult.value.paymentAttempt);
    } catch {
      const failed = await markPaymentAttemptSetupFailed(
        this.prisma,
        sessionId,
        transactionResult.value.id,
        transactionResult.value.paymentAttempt.id
      );
      if (!failed) {
        throw new ProblemException({
          status: HttpStatus.BAD_GATEWAY,
          code: "PAYMENT_GATEWAY_UNAVAILABLE",
          detail: "The payment provider is unavailable. Retry the Payment Attempt."
        });
      }
      paymentGatewayUnavailable(failed.order, failed.paymentAttempt);
    }

    return transactionResult.value;
  }

  async get(cookieHeader: string | undefined, orderId: string): Promise<OrderDto> {
    const sessionId = await this.requireSession(cookieHeader);
    return this.prisma.$transaction(async (transaction) => {
      const now = await databaseNow(transaction);
      await reconcileExpiredOrders(transaction, now);
      const order = await transaction.order.findFirst({ where: { id: orderId, guestSessionId: sessionId }, select: orderSelect });
      if (!order) orderNotFound();
      return toOrder(order);
    });
  }

  private async requireSession(cookieHeader: string | undefined): Promise<string> {
    const sessionId = await this.sessions.findSessionId(cookieHeader);
    if (!sessionId) guestSessionRequired();
    return sessionId;
  }

  private async createInTransaction(
    transaction: Prisma.TransactionClient,
    guestSessionId: string,
    expectedVersion: number | null,
    idempotencyKey: string,
    requestHash: string,
    input: CreateOrderDto
  ): Promise<CheckoutTransactionResult> {
    const now = await databaseNow(transaction);
    await reconcileExpiredOrders(transaction, now);

    const existing = await transaction.idempotencyRecord.findUnique({
      where: { guestSessionId_idempotencyKey: { guestSessionId, idempotencyKey } },
      select: {
        requestHash: true,
        order: { select: orderSelect },
        initialPaymentAttempt: { select: paymentAttemptSelect }
      }
    });
    if (existing) {
      if (existing.requestHash !== requestHash) idempotencyKeyReused();
      return { value: { ...toOrder(existing.order), paymentAttempt: toPaymentAttempt(existing.initialPaymentAttempt) }, created: false };
    }

    const cart = await findActiveCart(transaction, guestSessionId);
    if (!cart) guestSessionRequired("Bootstrap the current Cart before Checkout.");
    if (expectedVersion === null || cart.version !== expectedVersion) checkoutCartChanged(cart);
    if (cart.items.length === 0) emptyCart();

    const items = [...cart.items].sort((left, right) => left.productVariant.id.localeCompare(right.productVariant.id));
    for (const item of items) {
      if (!item.productVariant.isActive || !item.productVariant.product.isActive) checkoutCartChanged(cart);
      if (item.productVariant.availableQuantity < item.quantity) insufficientStock();
    }

    const totals = calculateOrderTotals(
      items.map((item) => ({ unitPrice: item.productVariant.price, quantity: item.quantity })),
      REGULAR_SHIPPING_FEE
    );

    for (const item of items) {
      const updated = await transaction.productVariant.updateMany({
        where: {
          id: item.productVariant.id,
          isActive: true,
          product: { isActive: true },
          availableQuantity: { gte: item.quantity }
        },
        data: { availableQuantity: { decrement: item.quantity } }
      });
      if (updated.count !== 1) insufficientStock();
    }

    const expiresAt = new Date(now.getTime() + ORDER_RESERVATION_MINUTES * 60_000);
    const order = await transaction.order.create({
      data: {
        guestSessionId,
        customerName: input.customer.name,
        customerEmail: input.customer.email,
        shippingAddress: input.shippingAddress as unknown as Prisma.InputJsonValue,
        shippingMethod: input.shippingMethod,
        subtotal: totals.subtotal,
        shippingFee: totals.shippingFee,
        grandTotal: totals.grandTotal,
        expiresAt,
        items: {
          create: items.map((item) => ({
            productVariantId: item.productVariant.id,
            skuSnapshot: item.productVariant.sku,
            nameSnapshot: item.productVariant.product.name,
            optionLabelSnapshot: item.productVariant.optionLabel,
            unitPrice: item.productVariant.price,
            quantity: item.quantity,
            lineTotal: item.productVariant.price * item.quantity
          }))
        }
      }
    });

    const paymentAttempt = await transaction.paymentAttempt.create({
      data: {
        orderId: order.id,
        providerReference: randomUUID(),
        amount: totals.grandTotal,
        expiresAt
      },
      select: paymentAttemptSelect
    });

    const closed = await transaction.cart.updateMany({
      where: { id: cart.id, guestSessionId, status: "ACTIVE", version: expectedVersion ?? -1 },
      data: { status: "CLOSED", version: { increment: 1 } }
    });
    if (closed.count !== 1) {
      const current = await findActiveCart(transaction, guestSessionId);
      if (!current) guestSessionRequired();
      checkoutCartChanged(current);
    }

    await transaction.cart.create({ data: { guestSessionId } });
    await transaction.idempotencyRecord.create({
      data: {
        guestSessionId,
        idempotencyKey,
        requestHash,
        orderId: order.id,
        initialPaymentAttemptId: paymentAttempt.id
      }
    });

    const created = await transaction.order.findUniqueOrThrow({ where: { id: order.id }, select: orderSelect });
    return { value: { ...toOrder(created), paymentAttempt: toPaymentAttempt(paymentAttempt) }, created: true };
  }
}

@ApiExtraModels(
  ProblemDetailsDto,
  MoneyDto,
  CheckoutCustomerDto,
  ShippingAddressDto,
  OrderItemDto,
  PaymentAttemptDto,
  OrderDto,
  OrderWithInitialPaymentAttemptDto,
  CartDto
)
@ApiTags("Orders")
@Controller("orders")
export class OrderController {
  constructor(@Inject(OrderService) private readonly orders: OrderService) {}

  @Post()
  @ApiCookieAuth("guest_session")
  @ApiOperation({ operationId: "orders_create", summary: "Create an awaiting-payment Order from the current Cart" })
  @ApiHeader({ name: "If-Match", required: true, description: "Quoted Cart version, for example \"2\"." })
  @ApiHeader({ name: "Idempotency-Key", required: true, description: "Printable ASCII key, 16 to 128 characters." })
  @ApiCreatedResponse({ type: OrderWithInitialPaymentAttemptDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  @ApiResponse({
    status: HttpStatus.PRECONDITION_REQUIRED,
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  create(
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(createValidationPipe(CreateOrderDto)) input: CreateOrderDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<OrderWithInitialPaymentAttemptDto> {
    response.setHeader("Cache-Control", "no-store");
    return this.orders.create(cookieHeader, ifMatch, idempotencyKey, input);
  }

  @Get(":orderId")
  @ApiCookieAuth("guest_session")
  @ApiOperation({ operationId: "orders_getById", summary: "Get a guest-owned Order" })
  @ApiParam({ name: "orderId", type: String, format: "uuid" })
  @ApiOkResponse({ type: OrderDto, headers: { "Cache-Control": { schema: { type: "string", example: "no-store" } } } })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  get(@Headers("cookie") cookieHeader: string | undefined, @Param("orderId", new ParseUUIDPipe()) orderId: string, @Res({ passthrough: true }) response: Response): Promise<OrderDto> {
    response.setHeader("Cache-Control", "no-store");
    return this.orders.get(cookieHeader, orderId);
  }
}
