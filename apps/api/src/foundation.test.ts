import assert from "node:assert/strict";
import test from "node:test";

import { Type } from "class-transformer";
import { IsIn, IsInt, Min } from "class-validator";

import { createApplication } from "./bootstrap.js";
import { createSignedGuestToken, hashGuestToken, serializeGuestSessionCookie, verifySignedGuestToken } from "./common/guest-session.js";
import { ProblemException } from "./common/problem-details.js";
import { createValidationPipe } from "./common/validation.js";
import { loadEnvironment } from "./config/environment.js";
import { HealthService } from "./health/health.js";
import type { PrismaService } from "./prisma/prisma.service.js";

process.env.NODE_ENV ??= "test";
process.env.PORT ??= "0";
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/mini_ecommerce_test";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;
process.env.COOKIE_SECRET ??= "test-cookie-secret";
process.env.FAKE_PAYMENT_WEBHOOK_SECRET ??= "test-webhook-secret";
process.env.PUBLIC_BASE_URL ??= "http://localhost:3000";

class QueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page!: number;

  @IsIn(["newest", "price_asc", "price_desc"])
  sort!: string;
}

test("validation transforms allowed values and rejects unknown fields", async () => {
  const pipe = createValidationPipe();
  const value = await pipe.transform(
    { page: "2", sort: "newest" },
    { type: "query", metatype: QueryDto, data: "query" }
  );
  assert.equal(value.page, 2);

  await assert.rejects(
    pipe.transform({ page: "2", sort: "newest", ignored: "nope" }, { type: "query", metatype: QueryDto, data: "query" }),
    (error: unknown) => error instanceof ProblemException && error.getStatus() === 422
  );
});

test("guest cookie is signed, opaque, hashed, and secure only for public HTTPS", () => {
  const secret = "cookie-secret";
  const { token, signedValue } = createSignedGuestToken(secret);
  assert.notEqual(token, signedValue);
  assert.equal(verifySignedGuestToken(signedValue, secret), token);
  assert.equal(verifySignedGuestToken(`${signedValue}x`, secret), null);
  assert.notEqual(hashGuestToken(token), token);
  assert.match(serializeGuestSessionCookie(signedValue, false), /HttpOnly; SameSite=Lax/);
  assert.match(serializeGuestSessionCookie(signedValue, true), /Secure/);
});

test("health returns unavailable without leaking database details", async () => {
  const neverResolves = { $queryRaw: () => new Promise<never>(() => undefined) } as unknown as PrismaService;
  const result = await new HealthService(neverResolves).check();
  assert.deepEqual(result, { status: "unavailable", database: "unavailable" });
});

test("HTTP foundation propagates request IDs, problems, and OpenAPI", async () => {
  const environment = loadEnvironment();
  const { app } = await createApplication({ environment, logger: false });
  await app.listen(0);

  try {
    const baseUrl = await app.getUrl();
    const response = await fetch(`${baseUrl}/api/v1/missing`, { headers: { "X-Request-Id": "foundation-test" } });
    const problem = (await response.json()) as { code: string; requestId: string };
    assert.equal(response.status, 404);
    assert.ok(response.headers.get("content-type")?.startsWith("application/problem+json"));
    assert.equal(response.headers.get("x-request-id"), "foundation-test");
    assert.equal(problem.code, "MALFORMED_REQUEST");
    assert.equal(problem.requestId, "foundation-test");

    const deniedOrigin = await fetch(`${baseUrl}/api/v1/missing`, {
      method: "POST",
      headers: { Origin: "https://evil.example", "content-type": "application/json" },
      body: "{}"
    });
    const deniedProblem = (await deniedOrigin.json()) as { status: number; code: string };
    assert.equal(deniedOrigin.status, 400);
    assert.equal(deniedProblem.status, 400);
    assert.equal(deniedProblem.code, "MALFORMED_REQUEST");

    const openApiResponse = await fetch(`${baseUrl}/docs-json`);
    const openApi = (await openApiResponse.json()) as { paths: Record<string, unknown>; components: { securitySchemes: Record<string, unknown> } };
    assert.equal(openApiResponse.status, 200);
    assert.ok(openApi.paths["/health"]);
    assert.ok(openApi.components.securitySchemes.guest_session);

    const body = JSON.stringify({ payload: "x".repeat(65_536) });
    const oversized = await fetch(`${baseUrl}/api/v1/missing`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body
    });
    const oversizedProblem = (await oversized.json()) as { status: number; requestId: string };
    assert.equal(oversized.status, 413);
    assert.equal(oversizedProblem.status, 413);
    assert.ok(oversizedProblem.requestId);
  } finally {
    await app.close();
  }
});
