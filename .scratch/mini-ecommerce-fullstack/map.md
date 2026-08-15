Label: wayfinder:map

## Destination

Produce an implementation-ready specification for a mobile-first mini e-commerce portfolio project, covering frontend and backend architecture, API contracts, consistency and payment strategy, a 100% free no-card toolchain, and ordered prompts that can be delegated to coding agents.

## Notes

- Domain: product listing, product detail, cart, checkout, articles, orders, and payment simulation.
- Consult `wayfinder`, `grilling`, `domain-modeling`, `codebase-design`, and `ponytail` while resolving tickets.
- Local development must work without creating any external account.
- The optional public deployment path must not require a credit or debit card.
- Use separate Next.js frontend and NestJS REST API applications in a pnpm monorepo. Develop them as separate processes, then serve the static frontend export from NestJS for the one-service public demo.
- Start with guest checkout using a signed HttpOnly cart cookie.
- Use an internal fake payment gateway with redirect, signed webhook, and deterministic outcomes.
- Products and articles start as deterministic database seed data. No CMS or admin dashboard in the MVP.
- Planning only. Do not implement application code while working this map.

## Decisions so far

- [Verify the free no-card stack](issues/01-verify-free-no-card-stack.md) - Guarantee the project locally with open-source tools; use one Render Free service plus Neon only as a disposable public demo path.
- [Select the deployment topology](issues/03-select-deployment-topology.md) - Develop separate web and API applications, then serve the static Next.js export from NestJS on one Render origin backed by Neon.
- [Define the commerce lifecycle](issues/02-define-commerce-lifecycle.md) - Treat Checkout as an idempotent process that snapshots an Order, reserves stock for 15 minutes, and reaches `PAID` only through a verified webhook.
- [Define persistence and transactions](issues/04-define-persistence-and-transactions.md) - Use a minimal relational model, derived Cart totals, snapshot Orders, atomic available-quantity reservations, and four explicit transaction flows.
- [Design the HTTP interface](issues/05-design-http-interface.md) - Use a versioned contract-driven REST API with generated OpenAPI types, ETag and idempotency protections, RFC 9457 errors, selective caching, signed fake-payment callbacks, and complete Swagger documentation.
- [Design the frontend data strategy](issues/06-design-frontend-data-strategy.md) - Use static content where possible, TanStack Query for live server state, URL-owned catalog filters, conservative Cart reconciliation, idempotent checkout intent, bounded Order polling, and accessible mobile-first state views.
- [Define verification gates](issues/07-define-verification-gates.md) - Prove business risks with focused Jest, PostgreSQL, and Playwright checks; enforce contract drift and quality gates in CI; verify the no-card demo path; and delegate implementation through bounded sequential prompts with targeted reviews.

## Not yet specified

- None.

## Completion

- All decision tickets are resolved.
- The compiled architecture is in [`docs/architecture/fullstack-plan.md`](../../docs/architecture/fullstack-plan.md).
- The sequential implementation and review prompts are in [`docs/agent-prompts.md`](../../docs/agent-prompts.md).

## Out of scope

- Customer registration and login for the MVP.
- Real-money payment integration.
- Admin dashboard or external CMS.
- Wishlist, reviews, recommendations, advanced promotions, multi-vendor support, refunds, and fulfillment operations.
- Microservices, Redis, queues, Kubernetes, and speculative scale infrastructure.
