# Free and no-card stack research

Checked against official sources on 2026-08-14.

## Conclusion

There are two different guarantees:

1. Local development can remain free indefinitely because the selected software is open source and runs on the developer's machine.
2. A public deployment can use current no-card free tiers, but no third-party free tier can be guaranteed forever. Providers can change quotas, terms, availability, or anti-abuse verification.

The smallest conventional public setup is:

- One Render Free Web Service that serves both the static frontend build and the NestJS API from one origin.
- Neon Free Postgres.
- Self-hosted Swagger UI at `/docs`.
- GitHub Actions using only its included free allowance.
- Seeded images committed as static assets.
- An in-process fake payment gateway.
- No transactional email in the MVP.

This keeps Next.js, NestJS, Prisma, and PostgreSQL while avoiding CORS, cross-site guest-cart cookies, a second always-on service, and extra storage/payment accounts.

## Recommended stack

| Concern | Local and source stack | Public no-card option | Important caveat |
|---|---|---|---|
| Frontend | Next.js static export, TypeScript, Tailwind CSS, TanStack Query | Static files served by the same Render Web Service as the API | Static export does not provide Next.js runtime SSR or built-in image optimization |
| Backend | NestJS on Node.js | Render Free Web Service | Sleeps after 15 minutes idle and cold start is about one minute |
| Database | Local PostgreSQL | Neon Free Postgres | Free capacity is limited and compute scales to zero |
| ORM | Prisma | Same code against Neon | Schema migrations must run explicitly during deploy |
| API contract | NestJS OpenAPI decorators and self-hosted Swagger UI | `/docs` and `/docs-json` on the API | Do not buy SwaggerHub, it is not needed |
| CI | Local scripts | GitHub Actions free allowance | Public repos have free standard runners; private GitHub Free has quota limits |
| Images | Files in the repository | Served as static frontend assets | No user uploads in MVP; Render filesystem is ephemeral |
| Email | Mailpit for local testing, only if needed | Omit from MVP | Public email delivery is not required by the exercise |
| Payment | `FakePaymentGateway` and signed fake webhook | Same adapter on the public demo | Clearly label it as simulated, never collect real card data |

## Evidence and limits

### Application hosting

Render's first-deploy guide says its free deployment requires no payment and supports a free Web Service. Every service receives a public `onrender.com` URL. Its free-service documentation states that a free service:

- spins down after 15 minutes without inbound traffic;
- can take about one minute to wake;
- receives 750 free instance hours per workspace per month;
- has an ephemeral filesystem;
- is suspended or has builds disabled after relevant free allowances are exhausted when no payment method is present, instead of creating an overage charge.

Sources: [Render first deploy](https://render.com/docs/your-first-deploy), [Render free services](https://render.com/docs/free), [Render web services](https://render.com/docs/web-services).

Serving the exported frontend from the NestJS process means only one free instance consumes the 750-hour pool. It also makes guest-cart cookies first-party and removes CORS from the application design.

Render Free Postgres should not be used for this project because its free database expires after 30 days and is deleted after a 14-day grace period. Neon is the persistent free-tier choice.

### PostgreSQL

Neon's official pricing lists the Free plan as `$0`, with no time limit and no credit card required. The current page lists 100 CU-hours per project per month, 0.5 GB storage per project, and compute sizes up to 2 CU. These figures can change, so the pricing page remains the authority.

Source: [Neon pricing](https://neon.com/pricing).

PostgreSQL itself has no license fee, including for commercial software.

Source: [PostgreSQL press FAQ](https://www.postgresql.org/about/press/faq/).

### Framework and ORM licenses

The core source stack has permissive licenses:

- Next.js uses the MIT license: [Next.js license](https://github.com/vercel/next.js/blob/canary/license.md).
- NestJS uses the MIT license: [Nest repository](https://github.com/nestjs/nest).
- Prisma uses Apache 2.0: [Prisma repository](https://github.com/prisma/prisma).

These licenses make local development independent of hosting free-tier changes.

### Swagger and OpenAPI

Swagger UI is Apache-2.0 open-source software and can be installed and served with the application. No hosted Swagger product or account is required.

Sources: [Swagger UI repository and license](https://github.com/swagger-api/swagger-ui), [Swagger UI installation](https://swagger.io/docs/open-source-tools/swagger-ui/usage/installation/).

Use NestJS to generate OpenAPI JSON at `/docs-json`, then mount self-hosted Swagger UI at `/docs`. SwaggerHub is unnecessary.

### Continuous integration

GitHub states that standard GitHub-hosted runners are free for public repositories. GitHub Free private repositories currently include 2,000 minutes per month and 500 MB artifact storage. If there is no valid payment method, additional usage is blocked after the allowance is used.

Sources: [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [included product usage](https://docs.github.com/en/billing/reference/product-usage-included).

For a strict zero-cost setup, use standard Ubuntu runners, avoid larger runners, keep artifacts small and short-lived, and let usage stop at the included limit. The project can still run the same checks locally.

### Product and article images

For the MVP, place licensed seed images in the repository and serve them with the frontend build. This requires no storage account and survives Render restarts. Do not implement uploads, since the exercise has no admin or seller workflow.

If remote image management is later required, Cloudinary currently advertises a free-forever plan with no credit card required and 25 monthly credits.

Source: [Cloudinary billing and plans](https://cloudinary.com/documentation/billing_and_plans).

Cloudinary is optional, not baseline. Adding it now introduces credentials and another failure mode without satisfying an MVP requirement.

### Email

Order email is not required for the purchase-flow exercise. The order confirmation page and order-status endpoint cover the required user feedback, so public email delivery should be omitted from the MVP.

If email behavior needs to be developed locally, Mailpit is an MIT-licensed local SMTP catcher with no signup.

Source: [Mailpit repository](https://github.com/axllent/mailpit).

Resend has a `$0` plan with 3,000 emails per month and 100 per day, but the official pricing material checked did not explicitly guarantee no-card account creation. It therefore should not be part of a strict no-card baseline.

Source: [Resend pricing](https://resend.com/docs/knowledge-base/what-is-resend-pricing).

### Payment simulation

Use an application-owned `FakePaymentGateway` that produces a fake redirect page and calls a signed fake webhook endpoint. This is guaranteed free, needs no external signup, and still exercises:

- backend-only secrets;
- server-calculated totals;
- idempotency keys;
- success, decline, expiry, and pending outcomes;
- webhook signature validation;
- duplicate webhook handling;
- order and payment state transitions.

Never ask users for real card details and display a prominent `Simulation only` label.

Stripe's official testing environment can simulate payments without moving money, but the documentation checked does not explicitly guarantee that account creation will never request payment-card or identity verification. Keep it as a later optional adapter, not a baseline dependency.

Source: [Stripe testing](https://docs.stripe.com/testing).

## Options excluded from the strict baseline

- Vercel Hobby: free for personal, non-commercial use, but its official plan page does not make the same explicit no-card signup promise used by Neon. It is also another origin unless the backend moves there.
- Render Free Postgres: expires after 30 days.
- Render local filesystem uploads: files disappear on restart, redeploy, or spin-down.
- GitHub Pages: GitHub states that Pages is not intended for commercial e-commerce. It is also static-only.
- Cloudflare R2: setup documentation requires completing checkout to add an R2 subscription, even though included usage exists.
- Fly.io: current official documentation requires a card for most new organizations and legacy free allowances are unavailable to new users.
- Real payment gateways: they commonly require business, identity, bank, or billing setup. None is needed to meet this exercise.

Sources: [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [Cloudflare R2 setup](https://developers.cloudflare.com/r2/get-started/), [Fly.io pricing](https://fly.io/docs/about/pricing/).

## Planning consequence

The implementation plan should have two explicit milestones:

1. Finish and verify the complete system locally. This is the only indefinitely guaranteed free path.
2. Deploy the demo to current no-card free tiers using one Render Web Service plus Neon. Treat deployment as disposable demonstration infrastructure, not production hosting.

When deployment limits become a problem, the owner must deliberately choose between accepting downtime, migrating provider, or authorizing paid infrastructure. The code should not automatically incur charges.
