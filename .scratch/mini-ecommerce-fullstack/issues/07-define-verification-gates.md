Type: grilling
Status: resolved
Blocked by: 03, 04, 05, 06

## Question

Which minimal automated checks and manual acceptance scenarios prove the API contract, money and inventory correctness, idempotent payment flow, frontend consistency, accessibility, responsive behavior, and optional deployment without overbuilding the test suite?

## Answer

Use Jest for focused backend unit and PostgreSQL integration tests, plus Playwright for five critical browser journeys, keyboard smoke checks, axe scans, and three representative responsive viewports. Test pure money, transition, expiry, and HMAC logic at unit level; prove transactions, constraints, ETags, idempotency, inventory races, expiry, webhook authentication, replay handling, and Guest ownership against PostgreSQL.

CI performs frozen install, formatting, lint, typecheck, migration, backend tests, OpenAPI/type drift detection, production build, and critical Playwright journeys. Do not use a global coverage percentage. A phase is done only when its acceptance criteria and relevant checks pass, generated contracts remain synchronized, documentation is updated, and any skipped check is reported.

Correctness does not depend on a paid scheduler: reconcile expired Orders before checkout, Order read, or Payment Attempt creation. Use deterministic seeds, isolated test data, request-correlated logs without personal data or secrets, focused security checks, and a public-demo smoke test that includes cold start, direct routes, cookies, checkout, webhook completion, and persistence across sleep.

Implement sequentially through fourteen bounded phases. Each copy-ready agent prompt specifies required reading, exact scope, constraints, acceptance criteria, commands, exclusions, and handoff. Add independent reviews after database design, HTTP contract, checkout transactions, payment webhooks, and the final integrated application. Prepare deployment files and instructions, but never let an agent commit, push, deploy, change providers, or add material dependencies without explicit user authorization.
