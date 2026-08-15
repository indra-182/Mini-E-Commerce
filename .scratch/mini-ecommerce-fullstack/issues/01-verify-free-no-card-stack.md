Type: research
Status: resolved
Blocked by:

## Question

Which current official tools and services can support local development and an optional public deployment for this architecture while remaining 100% free and never requiring a credit or debit card, and what limits or portability risks must the specification acknowledge?

## Answer

Use an entirely local open-source baseline for the only indefinite zero-cost guarantee: Next.js static export, NestJS, PostgreSQL, Prisma, self-hosted Swagger UI, repository-hosted seed images, and an application-owned fake payment gateway.

For an optional public demo, use one Render Free Web Service to serve both the exported frontend and NestJS API from one origin, backed by Neon Free Postgres. Render and Neon currently state that these free paths do not require a payment card. One origin avoids CORS and cross-site guest-cart cookie complexity while consuming only one Render free service.

The public path is disposable demo infrastructure. Render sleeps after inactivity and has an ephemeral filesystem; Neon has free capacity limits; all provider terms can change. The plan must complete and verify the system locally before public deployment and must never rely on automatic paid overages.

Swagger UI is self-hosted and Apache-2.0. GitHub Actions stays within its included allowance. Images remain static repository assets. Transactional email is omitted. Real payment providers are excluded from the strict baseline because their account or verification requirements are not guaranteed to remain card-free.

Full official-source evidence and current limits: [Free and no-card stack research](../../../docs/research/free-no-card-stack.md).
