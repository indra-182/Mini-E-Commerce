Type: grilling
Status: resolved
Blocked by: 02, 04

## Question

What is the smallest coherent versioned HTTP interface for catalog, articles, cart, checkout, payment callbacks, and order status, including validation, pagination, concurrency conflicts, idempotency, and Problem Details errors?

## Comments

- Round one accepted: generate OpenAPI from NestJS DTOs and controllers, generate frontend types from `/docs-json`, version business routes under `/api/v1`, return resources directly and RFC 9457 problems for errors, use page-number pagination, bootstrap the Guest Cart explicitly, and use slugs or opaque UUIDs as public identifiers.
- Round two accepted: expose paginated product and article reads; model Cart mutations with `ETag` and required `If-Match`; create an Order with `Idempotency-Key`; retry payment attempts only while the Order awaits payment; and keep the signed fake-provider webhook as the only path that can mark an Order paid.
- Final batch accepted: use integer IDR Money objects, UTC timestamps, summary/detail representations, strict validation, a compact RFC 9457 error catalog, explicit checkout-drift conflicts, selective Article/static-asset caching, request tracing, same-origin cookie protections, HMAC-signed fake webhooks, complete Swagger metadata, and a database-aware health check.

## Answer

Use a code-first but contract-driven NestJS REST API under `/api/v1`. Generate OpenAPI at `/docs-json`, host Swagger UI at `/docs`, and generate frontend types with `openapi-typescript`. Keep success responses resource-shaped, collections page-based, and all failures in RFC 9457 Problem Details.

Expose summary/detail reads for Products and Articles; an explicitly bootstrapped current Guest Cart; ETag-protected Cart mutations; idempotent Order creation; retryable Payment Attempts while awaiting payment; Order status reads; and a fake-provider UI, outcome endpoint, and signed webhook. The browser never supplies authoritative prices, totals, inventory, cart identity, or payment success.

Represent money as integer IDR amounts, time as ISO 8601 UTC, identifiers as opaque UUIDs or slugs, and enums in uppercase. Enforce strict input bounds and reject unknown fields. Use a small stable error-code catalog, return the current Cart on resolvable concurrency conflicts, conceal foreign Orders behind 404, and propagate `X-Request-Id`.

Cache Articles and fingerprinted static assets only. Mark Product, Cart, Order, checkout, and payment responses `no-store`. Keep the browser and API same-origin, use a signed HttpOnly `SameSite=Lax` secure cookie, verify unsafe-request origins, and authenticate fake webhooks with timestamped HMAC SHA-256 plus event deduplication. Document every operation, schema, header, cookie, success, and problem response in Swagger, and provide a database-aware `/health` endpoint.
