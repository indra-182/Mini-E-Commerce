import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { APP_ENVIRONMENT, type AppEnvironment } from "../config/environment.js";
import type { PaymentAttemptDto } from "../order/order.js";

export const PAYMENT_GATEWAY = Symbol("PAYMENT_GATEWAY");
export const FAKE_WEBHOOK_MAX_AGE_SECONDS = 5 * 60;

export type FakePaymentOutcome = "SUCCEEDED" | "FAILED";

export type SignedFakePaymentWebhook = {
  providerEventId: string;
  timestamp: string;
  signature: string;
  rawBody: Buffer;
};

export type PaymentGateway = {
  createPaymentSession(paymentAttempt: PaymentAttemptDto): Promise<void>;
  createOutcomeWebhook(paymentAttempt: PaymentAttemptDto, outcome: FakePaymentOutcome): SignedFakePaymentWebhook;
};

export function signFakePaymentWebhook(secret: string, timestamp: string, rawBody: Buffer | string): string {
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  return createHmac("sha256", secret).update(Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), body])).digest("hex");
}

export function verifyFakePaymentWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: Buffer | string,
  signature: string,
  now = new Date()
): boolean {
  if (!/^\d+$/.test(timestamp) || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (!Number.isSafeInteger(timestampSeconds) || !Number.isFinite(nowSeconds)) return false;
  if (Math.abs(nowSeconds - timestampSeconds) > FAKE_WEBHOOK_MAX_AGE_SECONDS) return false;

  const expected = Buffer.from(signFakePaymentWebhook(secret, timestamp, rawBody), "hex");
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

@Injectable()
export class FakePaymentGateway implements PaymentGateway {
  constructor(@Inject(APP_ENVIRONMENT) private readonly environment: AppEnvironment) {}

  async createPaymentSession(_paymentAttempt: PaymentAttemptDto): Promise<void> {
    return undefined;
  }

  createOutcomeWebhook(paymentAttempt: PaymentAttemptDto, outcome: FakePaymentOutcome): SignedFakePaymentWebhook {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = {
      eventType: outcome === "SUCCEEDED" ? "PAYMENT_SUCCEEDED" : "PAYMENT_FAILED",
      paymentAttemptId: paymentAttempt.id,
      providerReference: paymentAttempt.providerReference,
      amount: paymentAttempt.amount.amount,
      currency: paymentAttempt.amount.currency
    } as const;
    const rawBody = Buffer.from(JSON.stringify(payload), "utf8");

    return {
      providerEventId: randomUUID(),
      timestamp,
      signature: signFakePaymentWebhook(this.environment.fakePaymentWebhookSecret, timestamp, rawBody),
      rawBody
    };
  }
}
