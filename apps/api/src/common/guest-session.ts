import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { APP_ENVIRONMENT, type AppEnvironment } from "../config/environment.js";
import { PrismaService } from "../prisma/prisma.service.js";

export const GUEST_SESSION_COOKIE = "guest_session";

function signToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("base64url");
}

export function createSignedGuestToken(secret: string): { token: string; signedValue: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, signedValue: `${token}.${signToken(token, secret)}` };
}

export function verifySignedGuestToken(value: string, secret: string): string | null {
  const separator = value.lastIndexOf(".");
  if (separator <= 0 || separator === value.length - 1) return null;

  const token = value.slice(0, separator);
  const suppliedSignature = value.slice(separator + 1);
  const expectedSignature = signToken(token, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  return token;
}

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function serializeGuestSessionCookie(signedValue: string, secure: boolean): string {
  const attributes = ["Path=/", "HttpOnly", "SameSite=Lax"];
  if (secure) attributes.push("Secure");
  return `${GUEST_SESSION_COOKIE}=${encodeURIComponent(signedValue)}; ${attributes.join("; ")}`;
}

export function readGuestSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== GUEST_SESSION_COOKIE) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

@Injectable()
export class GuestSessionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APP_ENVIRONMENT) private readonly environment: AppEnvironment
  ) {}

  get secureCookie(): boolean {
    return this.environment.nodeEnv === "production" || this.environment.publicBaseUrl.protocol === "https:";
  }

  async createSession(): Promise<{ id: string; setCookie: string }> {
    const { token, signedValue } = createSignedGuestToken(this.environment.cookieSecret);
    const session = await this.prisma.guestSession.create({ data: { tokenHash: hashGuestToken(token) } });
    return { id: session.id, setCookie: serializeGuestSessionCookie(signedValue, this.secureCookie) };
  }

  async findSessionId(cookieHeader: string | undefined): Promise<string | null> {
    const signedValue = readGuestSessionCookie(cookieHeader);
    if (!signedValue) return null;

    const token = verifySignedGuestToken(signedValue, this.environment.cookieSecret);
    if (!token) return null;

    const session = await this.prisma.guestSession.findUnique({ where: { tokenHash: hashGuestToken(token) }, select: { id: true } });
    return session?.id ?? null;
  }
}
