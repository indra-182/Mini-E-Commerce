Type: grilling
Status: resolved
Blocked by: 01

## Question

Given the verified no-card service constraints, which local and optional public deployment topology should the project standardize on without distorting the learning goals or coupling the application to a fragile free tier?

## Answer

Standardize on a pnpm monorepo with separate `apps/web` and `apps/api` applications while keeping deployment topology simpler than development topology.

### Local topology

- Run Next.js and NestJS as separate development processes so the frontend-backend HTTP seam remains visible and independently testable.
- Run PostgreSQL natively for the strict open-source baseline. Offer Compose only as an optional convenience when the developer already has an OCI-compatible container runtime; Docker Desktop is not a prerequisite.
- Route browser API requests through a same-origin `/api` rewrite during development. This preserves first-party signed HttpOnly cart cookies without teaching the application to depend on permissive CORS.
- Serve Swagger UI from NestJS at `/docs` and the OpenAPI document at `/docs-json`.
- Require no external account for the complete local workflow.

### Public demo topology

- Export the Next.js application as static files.
- Build NestJS as the only runtime process.
- Have NestJS serve the exported frontend and static seed images, expose the HTTP interface under `/api/v1`, and expose Swagger UI under `/docs`.
- Deploy that single Node process as one Render Free Web Service.
- Use Neon Free Postgres through environment-provided connection strings. Keep schema migration explicit and never depend on Render's ephemeral filesystem for persistent data.

This keeps one public origin, one free compute service, first-party cookies, and no production CORS configuration. The same OpenAPI-defined HTTP seam still separates frontend and backend code even though one process serves both artifacts publicly.

### Accepted constraints

- The public demo does not use Next.js runtime SSR, ISR, Server Actions, or built-in runtime image optimization.
- Dynamic commerce data always comes from the NestJS HTTP interface. Static export is only the delivery mechanism for the frontend application.
- Render cold starts and Neon scale-to-zero delays are acceptable for a portfolio demo and must have an honest loading state.
- Free-tier quotas or terms may change. Local execution remains the authoritative, provider-independent completion target.
- Do not introduce a reverse proxy, second hosting provider, container orchestrator, object storage, Redis, or paid observability merely to imitate production infrastructure.
