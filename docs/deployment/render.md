# Optional Render and Neon demo

This repository prepares one Render Web Service that serves the Next.js static
export and the NestJS API from one origin. It does not create accounts, store
credentials, run remote migrations, or deploy anything.

## Manual setup

1. Create a Neon PostgreSQL project and copy its pooled connection URL into
   `DATABASE_URL`. Put the direct, non-pooled connection URL into `DIRECT_URL`.
2. Create a Render Web Service from this repository and keep the repository
   root as the service root.
3. Use the commands in `render.yaml`, or enter them in the dashboard:
   - Build: `corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm build:production`
   - Start: `pnpm start:production`
   - Health check: `/health`
4. Set `NODE_ENV=production`, `PUBLIC_BASE_URL` to the final service origin,
   and long random values for `COOKIE_SECRET` and
   `FAKE_PAYMENT_WEBHOOK_SECRET`.
5. Add the Neon URLs as secrets. Do not paste them into the repository.
6. After the first cold start, run the smoke flow against the service:

   ```powershell
   $env:SMOKE_BASE_URL = "https://your-service.onrender.com"
   pnpm.cmd smoke:production
   ```

The startup script applies committed Prisma migrations, seeds only an empty
database, and then starts NestJS. It never resets or deletes production data.

## Local production topology

With a disposable local PostgreSQL database and the required environment
variables set, run:

```powershell
pnpm.cmd build:production
pnpm.cmd start:production
```

The assembled frontend is copied to `apps/api/dist/public`. NestJS serves
static HTML/assets while reserving `/api`, `/docs`, `/docs-json`, and `/health`
for API and platform routes. Direct Product, Article, Order, and Fake Payment
URLs therefore work from the same origin.

## Demo limitations

Render Free services sleep after inactivity and can have a cold start. Neon
Free compute can scale to zero and has finite monthly compute and storage
limits. The filesystem is ephemeral, so business data belongs in PostgreSQL;
the application does not write it to disk. Current provider limits and terms
can change, and no automatic paid upgrade is configured.
