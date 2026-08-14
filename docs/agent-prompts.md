# Mini E-Commerce Agent Prompt Pack

Gunakan prompt secara berurutan. Jangan menjalankan fase yang saling bergantung secara paralel. Setelah setiap prompt selesai, baca handoff agent dan pastikan checks yang diwajibkan benar-benar lulus sebelum melanjutkan.

Dokumen acuan utama: [`docs/architecture/fullstack-plan.md`](architecture/fullstack-plan.md).

## Aturan penggunaan

1. Jalankan Phase 00 sampai Phase 13 secara berurutan.
2. Jalankan review gate setelah Phase 01, 02, 05, dan 06.
3. Jika review menemukan masalah, selesaikan dalam review gate tersebut sebelum lanjut.
4. Jangan meminta agent melakukan commit, push, deploy, atau membuat akun eksternal.
5. Agent boleh menambah dependency yang secara eksplisit disebut plan. Dependency production lain memerlukan persetujuan user.
6. Jika sebuah check tidak dapat dijalankan, agent harus menjelaskan penyebab dan bukti alternatif. Jangan menerima klaim “selesai” tanpa itu.

---

## Phase 00: Repository foundation

```text
Implementasikan Phase 00, repository foundation, untuk Mini E-Commerce.

Required reading:
- AGENTS.md yang berlaku di workspace.
- CONTEXT.md.
- docs/architecture/fullstack-plan.md, terutama bagian 1 sampai 5, 12, dan 14 sampai 16.
- docs/research/free-no-card-stack.md.

Objective:
Buat pnpm monorepo minimal dengan apps/web untuk Next.js static export dan apps/api untuk NestJS, plus lokasi Prisma dan package yang sudah disetujui plan. Local development harus dapat dijalankan tanpa akun eksternal atau kartu.

Scope:
- Workspace configuration, TypeScript base configuration, ignore files, dan root scripts.
- Next.js TypeScript app shell yang dikonfigurasi untuk static export.
- NestJS TypeScript app shell dengan environment validation dasar.
- Folder packages/content-fixtures dan packages/api-types tanpa membuat abstraction spekulatif.
- .env.example hanya berisi nama variable dari plan, tanpa secret.
- Dokumentasi perintah install, local PostgreSQL setup native, dev, build, lint, typecheck, dan test.
- Compose boleh ditambahkan hanya sebagai convenience opsional, bukan prerequisite.

Constraints:
- Gunakan pnpm workspaces, Next.js, NestJS, TypeScript, Tailwind CSS, Prisma tooling, dan tooling yang tercantum di plan.
- Jangan implementasikan fitur commerce, database models, endpoint bisnis, atau UI final.
- Jangan menambah Turborepo, Nx, container requirement, UI kit, Redux, Zustand, Axios, atau library “untuk nanti”.
- Jangan commit, push, deploy, atau membuat akun.

Acceptance criteria:
- Fresh install dapat diselesaikan dengan satu package-manager command.
- apps/web dan apps/api dapat typecheck dan build secara independen.
- Static-export constraint Next.js sudah aktif.
- Root scripts hanya mengorkestrasi command yang benar-benar ada.
- Environment sample sesuai plan dan tidak berisi credential.

Required checks:
- Frozen or equivalent clean install check.
- Format check, lint, typecheck, dan build untuk kedua app.
- Review git diff untuk generated junk, secret, dan unrelated files.

Handoff:
Laporkan file yang dibuat/diubah, scripts yang tersedia, checks beserta hasilnya, dan keputusan kecil yang belum ditentukan. Jangan mengerjakan Phase 01.
```

## Phase 01: PostgreSQL schema and deterministic seed

```text
Implementasikan Phase 01, database schema dan deterministic seed.

Gunakan skill domain-modeling dan tdd bila tersedia.

Required reading:
- AGENTS.md, CONTEXT.md.
- docs/architecture/fullstack-plan.md bagian 6, 7, 12, dan 16.
- Handoff Phase 00 dan konfigurasi repository yang sudah ada.

Objective:
Implementasikan Prisma schema, PostgreSQL migration, constraints, indexes, content fixtures, dan seed deterministik sesuai domain plan.

Scope:
- Models: GuestSession, Product, ProductVariant, Article, Cart, CartItem, Order, OrderItem, PaymentAttempt, WebhookEvent, IdempotencyRecord.
- Enums dan relasi yang persis dibutuhkan lifecycle.
- PostgreSQL-specific partial unique index untuk satu active Cart per Guest melalui migration SQL terfokus.
- Constraints positif/non-negatif dan uniqueness dari plan.
- Stable fixture IDs/slugs/SKUs, sanitized Article HTML, dan static image paths.
- Explicit dev reset, isolated test reset, serta idempotent seed-if-empty.
- DATABASE_URL runtime dan DIRECT_URL migration contract.

Constraints:
- Jangan membuat Checkout, Customer, reusable Address, Inventory, Reservation, soft-delete, audit log, repository, atau generic base entity.
- Order-facing fields harus snapshot, bukan bergantung pada Product setelah checkout.
- Jangan menghapus atau me-reset database non-test secara otomatis.

Acceptance criteria:
- Migration berhasil pada PostgreSQL kosong.
- Menjalankan seed-if-empty dua kali tidak menduplikasi data.
- Constraint penting gagal dengan benar saat diuji menggunakan data invalid.
- Fixture yang sama dapat dibaca oleh build frontend dan Prisma seed tanpa copy-paste sumber data.

Required checks:
- Prisma format dan validate.
- Apply migration pada database test kosong.
- Focused tests untuk uniqueness, partial active-Cart constraint, positive quantities, dan idempotent seed.
- Lint dan typecheck area yang berubah.

Handoff:
Laporkan diagram ringkas relasi aktual, migration yang dibuat, perintah seed/reset, checks, dan deviasi apa pun dari plan. Jangan mengerjakan API.
```

## Review Gate A: Database and domain invariants

```text
Review dan perbaiki hasil Phase 01 sebelum fase API dimulai.

Required reading:
- AGENTS.md, CONTEXT.md.
- docs/architecture/fullstack-plan.md bagian 6 dan 7.
- Seluruh Prisma schema, migrations, fixtures, seed, dan tests.

Review focus:
- Kesesuaian istilah domain dan ownership.
- Order snapshot benar-benar immutable secara desain.
- One-active-Cart partial unique index benar.
- Quantities, prices, totals, inventory, uniqueness, dan referential behavior dijaga database.
- Tidak ada model atau abstraction di luar scope.
- Reset tidak dapat menyentuh database selain environment yang secara eksplisit ditandai test/development.

Action:
Perbaiki hanya temuan correctness atau spec yang terkonfirmasi. Tambahkan test terkecil yang membuktikan setiap perbaikan. Jangan melakukan redesign di luar plan.

Required checks:
- Recreate database test dari nol, migrate, seed dua kali, dan jalankan focused tests.
- Prisma validate, lint, dan typecheck.

Handoff:
Daftar temuan berdasarkan severity, perubahan yang dilakukan, checks, dan risiko residual. Jangan mengerjakan Phase 02.
```

## Phase 02: API foundation and OpenAPI conventions

```text
Implementasikan Phase 02, fondasi NestJS API dan OpenAPI.

Gunakan skill codebase-design bila tersedia. Pilih modul yang dalam dan sedikit, bukan layer generik.

Required reading:
- AGENTS.md, CONTEXT.md.
- docs/architecture/fullstack-plan.md bagian 8, 10, dan 12.
- Existing API app, Prisma layer, dan handoff database review.

Objective:
Bangun konvensi HTTP yang akan dipakai seluruh endpoint tanpa lebih dulu mengimplementasikan fitur bisnis.

Scope:
- Global `/api/v1` prefix untuk business routes.
- Environment validation, 64 KB body limit, request ID propagation, dan safe logging context.
- Strict DTO validation: transform nilai query yang diizinkan, whitelist, forbid unknown.
- RFC 9457 Problem Details mapping dan stable code catalog.
- Signed opaque Guest Session cookie foundation dengan token hash, HttpOnly, SameSite=Lax, Path=/, Secure in public.
- Allowed-Origin validation untuk unsafe browser methods.
- Swagger UI `/docs`, OpenAPI JSON `/docs-json`, stable operationId convention, tags, cookie auth scheme, common Problem schemas.
- Database-aware `/health` dengan timeout pendek dan response tanpa internal detail.
- Script untuk generate OpenAPI artifact dan packages/api-types melalui openapi-typescript.

Constraints:
- NestJS DTO/controller metadata adalah source of truth. Jangan menulis OpenAPI YAML kedua.
- Gunakan native fetch pada frontend nanti, jangan generate giant SDK.
- Jangan implementasikan Product, Article, Cart, Checkout, Order, atau Payment behavior pada fase ini.

Acceptance criteria:
- Invalid input menghasilkan application/problem+json dengan requestId.
- Unknown fields ditolak.
- Swagger UI dan JSON tersedia.
- Generated TypeScript types dapat dibuat secara deterministik.
- Health membedakan healthy dan database-unavailable tanpa membocorkan credential.

Required checks:
- Focused integration tests untuk validation, body limit, request ID, cookie flags, Origin checks, Problem Details, Swagger generation, dan health.
- OpenAPI generation dua kali menghasilkan output identik.
- Lint, typecheck, dan build API.

Handoff:
Laporkan conventions yang dapat digunakan feature berikutnya, generated artifacts, checks, dan error codes aktual. Jangan membuat endpoint bisnis.
```

## Review Gate B: HTTP and OpenAPI foundation

```text
Review dan perbaiki Phase 02 terhadap kontrak arsitektur.

Required reading:
- AGENTS.md.
- docs/architecture/fullstack-plan.md bagian 8 dan 10.
- API bootstrap, validation, filters/interceptors/middleware, session handling, Swagger setup, generated types, dan tests.

Review focus:
- Satu source of truth untuk contract.
- RFC 9457 media type dan field consistency.
- Request ID tersedia di response, Problem, dan log context.
- Cookie, Origin, body limit, dan unknown-field protections benar.
- Swagger mencatat headers, cookies, success, dan problem schemas tanpa manual duplication yang mudah drift.
- Tidak ada sensitive data dalam log atau error.

Action:
Perbaiki focused correctness/spec issues dan tinggalkan test yang gagal sebelum fix. Jangan menambah generic framework baru.

Required checks:
- Seluruh Phase 02 integration tests.
- OpenAPI/type generation clean-diff check.
- Lint, typecheck, build.

Handoff:
Laporkan findings, fixes, commands, dan residual risk. Jangan mengerjakan Phase 03.
```

## Phase 03: Catalog and Article backend

```text
Implementasikan Phase 03, Product dan Article read API.

Required reading:
- AGENTS.md, CONTEXT.md.
- docs/architecture/fullstack-plan.md bagian 7 dan 8, terutama catalog/article contract, validation, dan cache policy.
- Existing fixtures, API conventions, dan generated-type workflow.

Objective:
Implementasikan read-only Product dan Article endpoints sesuai OpenAPI contract.

Scope:
- Product collection dengan search, category, sort, page, dan pageSize.
- Product detail by slug dengan Variant price dan availability.
- Article collection by type dan pagination.
- Article detail by slug dengan sanitized contentHtml.
- Summary/detail DTO separation, Money/PageInfo representation, not-found Problems, operationId, examples, dan cache headers.
- Basic PostgreSQL query indexes yang memang dipakai.

Constraints:
- Product responses `no-store`; Article GET cache sesuai plan.
- Unknown filter atau sort ditolak, bukan diabaikan.
- Tidak membuat full-text search, CMS, admin, uploads, recommendations, atau generic query framework.

Acceptance criteria:
- Pagination metadata akurat.
- Sorting harga memakai Variant price semantics yang didokumentasikan dan deterministik.
- Inactive/unpublished records tidak bocor.
- Swagger dan generated frontend types mencakup semua response.

Required checks:
- Integration tests untuk filters, sort, pagination boundaries, inactive data, detail/not-found, response shape, dan cache headers.
- OpenAPI/type drift check, lint, typecheck, build.

Handoff:
Laporkan endpoints, query semantics, checks, dan generated contract changes. Jangan mengerjakan Cart.
```

## Phase 04: Guest Cart backend

```text
Implementasikan Phase 04, Guest Cart API dengan concurrency control.

Gunakan TDD untuk mutation dan conflict behavior.

Required reading:
- AGENTS.md, CONTEXT.md.
- docs/architecture/fullstack-plan.md bagian 6 sampai 8 dan 10.
- Existing session, Product API, Prisma schema, dan API conventions.

Objective:
Implementasikan explicit Cart bootstrap, current Cart reads, dan item mutations dengan signed Guest ownership serta ETag/If-Match.

Scope:
- POST /api/v1/cart dan GET /api/v1/cart.
- POST, PATCH, DELETE current Cart items.
- Lazy Guest session creation, one active Cart invariant, quantity 1..99.
- Cart totals selalu diturunkan dari current Variant prices.
- Quoted Cart-version ETag dan required If-Match mutation precondition.
- 428 missing precondition, 412 stale version dengan currentCart, dan 404 item semantics.
- Add existing Variant menggabungkan quantity.

Constraints:
- Cart tidak menyimpan snapshot harga dan tidak mereservasi stock.
- Mutation harus atomic dan stale mutation tidak boleh mengubah data.
- Jangan membuat global Cart singleton, user account, repository abstraction, atau optimistic server behavior.

Acceptance criteria:
- Guest berbeda tidak berbagi Cart.
- Parallel stale mutations menghasilkan satu success dan conflict yang dapat direconcile.
- Setiap success mengembalikan full Cart dan ETag baru.
- Swagger/types sinkron.

Required checks:
- PostgreSQL integration tests untuk bootstrap idempotency, ownership, totals, merging, bounds, missing/stale/correct If-Match, dan concurrent mutation.
- OpenAPI drift, lint, typecheck, build.

Handoff:
Laporkan Cart shape, ETag semantics, tests, dan known limitations. Jangan mengerjakan Checkout.
```

## Phase 05: Checkout, inventory transaction, Order and expiry

```text
Implementasikan Phase 05, Checkout dan inventory correctness.

Wajib gunakan TDD. Ini money dan concurrency path, jangan mengganti integration test dengan mock database.

Required reading:
- AGENTS.md, CONTEXT.md.
- docs/architecture/fullstack-plan.md bagian 6 sampai 8, 10, dan 11.
- Prisma migrations, Cart implementation, API contract, dan existing tests.

Objective:
Implementasikan POST /api/v1/orders, GET Order, serializable checkout transaction, idempotency, immutable snapshots, 15-minute reservation, dan lazy expiry.

Scope:
- Strict checkout DTO tanpa cartId/items/prices/totals.
- Required If-Match dan Idempotency-Key.
- Canonical request hash scoped ke Guest.
- Serializable Prisma transaction dengan stable Variant ordering, conditional stock decrement, dan P2034 retry maksimal tiga kali.
- Atomic Order/OrderItem snapshot, stock reservation, old Cart close, new Cart creation, idempotency record, initial Payment Attempt.
- CHECKOUT_CART_CHANGED dengan currentCart dan distinct INSUFFICIENT_STOCK.
- Guest-owned Order read with foreign IDs concealed as 404.
- Lazy expiry before checkout, Order read, dan later payment-attempt creation.
- Guarded stock return exactly once.

Constraints:
- Database time authoritative.
- Tidak ada network call di dalam transaction.
- Tidak ada generic transaction manager, inventory ledger, worker, queue, cron, atau stored Cart total.
- Jangan implementasikan webhook pada fase ini.

Acceptance criteria:
- Browser input tidak dapat mengubah authoritative price atau total.
- Same idempotency key and payload returns same Order; changed payload conflicts.
- Dua checkout untuk stok terakhir menghasilkan tepat satu success.
- Expiry berulang mengembalikan stock satu kali.
- Closed Cart tidak dapat dimutasi dan Guest mendapat active Cart baru.

Required checks:
- Unit tests untuk Money, totals, state transitions, dan expiry eligibility.
- PostgreSQL integration tests untuk every acceptance criterion, including real concurrent requests and transaction retry behavior.
- OpenAPI/type drift, lint, typecheck, build.

Handoff:
Laporkan transaction boundaries, retry policy, idempotency hashing, race-test evidence, dan checks. Jangan mengerjakan fake gateway.
```

## Review Gate C: Checkout and inventory correctness

```text
Lakukan adversarial review dan focused fixes pada Phase 05.

Required reading:
- AGENTS.md, CONTEXT.md.
- docs/architecture/fullstack-plan.md bagian 6, 7, 8, dan 11.
- Seluruh Cart, Checkout, Order, expiry, Prisma, dan integration-test code.

Trace end-to-end:
- stale ETag request;
- price drift;
- insufficient stock;
- duplicate checkout timeout retry;
- same key with changed body;
- two buyers racing for one unit;
- expiry called twice;
- foreign Guest probing an Order.

Review focus:
- Semua invariant berada di transaction/constraint yang tepat.
- Tidak ada read-check-write race.
- P2034 retries bounded dan tidak mengulang side effect eksternal.
- Only successful guarded transition returns inventory.
- Snapshot tidak bergantung pada future Product mutation.

Action:
Perbaiki temuan terkonfirmasi dengan diff terkecil dan regression test. Jangan memperluas domain.

Required checks:
- Full backend unit/integration suite dengan PostgreSQL nyata.
- Jalankan concurrency cases beberapa kali untuk mendeteksi flakiness.
- OpenAPI drift, lint, typecheck, build.

Handoff:
Temuan berdasarkan severity, fixes, bukti race tests, dan risiko residual. Jangan lanjut ke payment.
```

## Phase 06: Fake payment and webhook lifecycle

```text
Implementasikan Phase 06, fake payment provider dan signed webhook.

Wajib gunakan TDD untuk HMAC, replay, dan terminal-state races.

Required reading:
- AGENTS.md, CONTEXT.md.
- docs/architecture/fullstack-plan.md bagian 6 sampai 8, 10, dan 11.
- Checkout/Order implementation dan review handoff.

Objective:
Implementasikan Payment Attempt retry, deterministic fake outcomes, signed provider callback, event deduplication, dan eligible Order transition.

Scope:
- POST Order payment-attempts while Order is awaiting and unexpired.
- POST fake-payment outcome for SUCCEEDED, FAILED, or remain PENDING.
- Internal fake provider signs timestamp.rawBody using HMAC SHA-256.
- Webhook verifies raw body, timestamp window, constant-time signature, provider event ID, ownership mapping, amount/currency, and eligible state.
- Webhook transaction inserts event, changes attempt, and conditionally changes Order.
- Duplicate event returns successful no-op.
- Gateway setup failure after Order commit marks attempt FAILED while preserving Order for retry.

Constraints:
- Browser never marks paid and never calls webhook directly.
- Never collect card-like fields.
- Secrets, signatures, cookies, PII, dan complete idempotency keys must not enter logs.
- Late success cannot revive EXPIRED; duplicate success cannot apply twice.

Acceptance criteria:
- Invalid/old signature rejected.
- Duplicate provider event safe.
- Failure allows another attempt on same Order.
- Success before expiry reaches PAID.
- Expiry versus success race produces exactly one terminal state with correct inventory effect.

Required checks:
- Unit tests for deterministic canonical signing and verification.
- PostgreSQL integration tests for invalid, duplicate, failure/retry, success, late event, amount mismatch, and expiry race.
- OpenAPI/type drift, lint, typecheck, build.

Handoff:
Laporkan signature contract, transaction flow, race evidence, endpoints, checks, dan residual risk. Jangan mengerjakan frontend.
```

## Review Gate D: Payment security and idempotency

```text
Lakukan security-focused review dan fixes pada fake payment lifecycle.

Required reading:
- AGENTS.md.
- docs/architecture/fullstack-plan.md bagian 6, 8, 10, dan 11.
- Payment gateway, raw-body setup, webhook, Order expiry, logging, dan tests.

Attempt these failures:
- forged signature;
- valid signature over modified body;
- timestamp outside five-minute window;
- duplicate event ID with changed payload;
- wrong amount or currency;
- success after expiry;
- simultaneous expiry and success;
- browser directly posting a success event;
- sensitive values appearing in logs or Problems.

Action:
Fix confirmed security/spec issues and add the smallest regression test for each. Do not introduce a real provider or external security service.

Required checks:
- Full payment and Order integration suite against PostgreSQL.
- Relevant unit tests, lint, typecheck, build, OpenAPI drift.

Handoff:
List findings by severity, fixed attack paths, commands, and residual assumptions. Jangan lanjut ke frontend.
```

## Phase 07: Frontend shell and shared primitives

```text
Implementasikan Phase 07, frontend shell dan minimal shared foundation.

Gunakan codebase-design dan Ponytail Lite bila tersedia. Jangan membuat design system spekulatif.

Required reading:
- AGENTS.md, CONTEXT.md.
- docs/architecture/fullstack-plan.md bagian 5, 9, 10, dan 16.
- Generated API types and existing web configuration.

Objective:
Buat accessible mobile-first shell, typed native-fetch client, TanStack Query provider, error parsing, dan primitive yang sudah terbukti dibutuhkan.

Scope:
- Semantic header/main/footer, responsive navigation, Cart badge placeholder behavior.
- Typed fetch wrapper yang memahami success JSON, Problem Details, X-Request-Id, ETag, dan credentials.
- Query client defaults appropriate for no-store commerce data.
- Primitive minimum: Button, Input, Select, QuantityControl, Price, ProductCard, Pagination, ProblemMessage, Skeleton.
- Global tokens/styles untuk spacing, color, typography, focus, reduced motion, dan 44px targets.
- Route shells dari plan, termasuk query-based Order dan Fake Payment routes.

Constraints:
- Jangan menambah Redux, Zustand, Axios, React Hook Form, UI kit, generic modal framework, form builder, animation library, purple-gradient/glass UI, atau abstraction tanpa second use.
- Tidak perlu menghubungkan semua feature data pada fase ini.

Acceptance criteria:
- Shell tidak overflow pada 375px.
- Keyboard focus terlihat dan navigation semantic.
- API wrapper menjaga Problem dan ETag tanpa `any` leakage.
- Production static export masih berhasil.

Required checks:
- Format, lint, typecheck, production build/static export.
- Manual keyboard and 375px/1440px smoke check.

Handoff:
Laporkan primitives, API/query conventions, routes, checks, dan feature placeholders. Jangan implementasikan Product/Article behavior.
```

## Phase 08: Catalog and Article frontend

```text
Implementasikan Phase 08, Product dan Article frontend.

Required reading:
- AGENTS.md, CONTEXT.md.
- docs/architecture/fullstack-plan.md bagian 8 dan 9.
- Existing API types, fixtures, routes, primitives, dan Product/Article endpoints.

Objective:
Bangun mobile-first PLP, PDP, Article listing, dan Article detail dengan rendering/data split dari plan.

Scope:
- PLP live query dengan URL-owned search/category/sort/page dan reset page saat filter berubah.
- Preserve previous page during pagination and provide loading/no-results/retry states.
- PDP build-known slug path, live current Product/Variant data, stock states, Variant selection, dan Add-to-Cart integration hook.
- Article pages static-generated from canonical sanitized fixtures.
- Mobile filter drawer, desktop sidebar, semantic pagination, accessible Product cards, explicit image dimensions/lazy loading.

Constraints:
- Product data stale immediately and backend remains authoritative.
- Article HTML must originate only from trusted sanitized fixture content.
- No client global filter store, raw unsanitized HTML, recommendations, reviews, or image service.

Acceptance criteria:
- Filter state survives reload and browser back/forward.
- Direct static Product/Article routes build and open.
- Loading, empty, error, not-found, out-of-stock states are usable.
- No horizontal overflow on required viewports.

Required checks:
- Focused Playwright flows for URL filters, pagination, direct routes, not-found, and Product selection.
- Keyboard smoke, axe on PLP/PDP/Article Detail, lint, typecheck, static build.

Handoff:
Laporkan route behavior, static paths, query keys, accessibility results, dan checks. Jangan membangun Cart page.
```

## Phase 09: Cart frontend

```text
Implementasikan Phase 09, Guest Cart frontend dan reconciliation.

Required reading:
- AGENTS.md, CONTEXT.md.
- docs/architecture/fullstack-plan.md bagian 8 dan 9.
- Cart API contract, generated types, fetch/query conventions, dan Product UI.

Objective:
Hubungkan Add to Cart, Cart badge, Cart page, dan ETag-safe item mutations tanpa optimistic commerce state.

Scope:
- Lazy POST /cart only when opening Cart or adding without a session.
- Passive badge GET treats 401 as zero without creating a Cart.
- Shared Cart query cache for badge and page.
- Add/update/delete sends current If-Match and replaces full cache plus ETag on success.
- Disable affected controls during mutation.
- 412 replaces cache with currentCart and shows actionable inline warning.
- Empty, loading, network-error, removed/inactive Variant, and quantity-limit states.
- Accessible live confirmation for successful add.

Constraints:
- No separate global Cart store and no optimistic price/quantity/total mutation.
- Do not persist Cart data in localStorage.
- Do not begin Checkout implementation.

Acceptance criteria:
- Cart is consistent after refresh.
- Badge and page cannot diverge after a successful mutation.
- Simulated stale ETag produces understandable reconciliation.
- Controls remain keyboard-usable and errors are not toast-only.

Required checks:
- Playwright add/update/delete/refresh, lazy bootstrap, and stale-version journey.
- Axe and keyboard smoke on Cart; lint, typecheck, static build.

Handoff:
Laporkan query/cache ownership, ETag storage, reconciliation behavior, and checks. Jangan mengerjakan checkout screens.
```

## Phase 10: Checkout, fake payment and Order frontend

```text
Implementasikan Phase 10, frontend purchase completion journey.

Required reading:
- AGENTS.md, CONTEXT.md.
- docs/architecture/fullstack-plan.md bagian 6, 8, dan 9.
- Generated types, Cart UI, Order/payment APIs, dan backend Problem codes.

Objective:
Bangun Checkout form, idempotent submission, fake-payment page, Payment Attempt retry, dan bounded Order polling.

Scope:
- Native accessible Checkout form for exact MVP fields.
- Client validation for immediate feedback; map backend field errors as authority.
- Generate one UUID per checkout intent, retain in sessionStorage across uncertain network retry, replace when Cart/input intent changes, clear after definitive outcome.
- Submit If-Match and Idempotency-Key without browser price/item/total fields.
- Handle success, gateway setup failure with existing Order, Cart drift, insufficient stock, validation, and ambiguous network failure.
- Fake-payment Simulation-only UI for success, failure, and pending.
- Query-based Order route, ownership-safe not-found, awaiting/paid/expired/failure states, retry Payment Attempt.
- Poll every two seconds only while visible, stop at terminal/two minutes, manual refresh afterward.

Constraints:
- No real card-like fields, real provider, WebSocket, SSE, background worker, or localStorage PII.
- Payment redirect/query parameters never mark Order paid.
- Critical errors are inline/status panels, not toast-only.

Acceptance criteria:
- Double click/network retry cannot create duplicate Order.
- Failed attempt retries on the same Order.
- Success arrives only after signed webhook processing and polling observes PAID.
- Expired Order cannot retry.
- Error summary receives focus and fields expose accessible descriptions.

Required checks:
- Playwright success, failure-then-retry, pending timeout/manual refresh, stale Cart, insufficient stock, and reload/ambiguous-retry cases.
- Axe and keyboard checks for Checkout, Fake Payment, Order.
- Lint, typecheck, static build.

Handoff:
Laporkan idempotency lifecycle, polling behavior, every mapped Problem code, accessibility checks, dan test results. Jangan mengerjakan deployment.
```

## Phase 11: Cross-layer verification and accessibility

```text
Implementasikan Phase 11, integrated verification gates.

Required reading:
- AGENTS.md.
- docs/architecture/fullstack-plan.md bagian 10, 11, dan 15.
- Seluruh existing test scripts and phase handoffs.

Objective:
Pastikan test suite minimum membuktikan risiko bisnis dan UI tanpa mengejar coverage percentage atau test setiap function.

Scope:
- Lengkapi focused unit tests: Money/totals, transitions, expiry eligibility, HMAC.
- Lengkapi PostgreSQL integration tests: ownership, ETag, idempotency, stock race, expiry once, webhook invalid/duplicate/late/success, expiry-payment race.
- Pastikan lima critical Playwright journeys dari plan stabil dan isolated.
- Axe scans dan keyboard smoke pada halaman wajib.
- Viewport checks 375x667, 768x1024, 1440x900 termasuk overflow dan long-content cases.
- Root verification commands dan CI-ready test database workflow.

Constraints:
- Jangan menambah Cypress, component-test framework, snapshot massal, global coverage threshold, load-testing suite, atau mocks untuk behavior PostgreSQL.
- Perbaiki defect yang ditemukan dengan perubahan focused dan regression test.

Acceptance criteria:
- Semua required scenario punya executable proof.
- Test deterministik dan tidak bergantung public demo.
- Failure output cukup jelas untuk diagnosis.
- Tidak ada accessibility violation serius yang diketahui pada required pages.

Required checks:
- Jalankan full local verification sequence dari clean test database.
- Ulangi concurrency tests untuk memeriksa flakiness.
- Production build/static export.

Handoff:
Berikan test matrix final, command dan durasi kasar, fixes, skipped check dengan alasan, dan known residual risks. Jangan deploy.
```

## Phase 12: Public deployment preparation

```text
Implementasikan Phase 12, preparation untuk optional no-card public demo. Jangan melakukan deployment aktual.

Required reading:
- AGENTS.md.
- docs/architecture/fullstack-plan.md bagian 3, 4, 12, dan 13.
- docs/research/free-no-card-stack.md.
- Existing build, migration, seed, health, static-export, and server entrypoint.

Objective:
Siapkan satu Render Web Service yang dapat menjalankan static frontend plus NestJS API dengan Neon, tanpa membuat akun, menyimpan secret, atau men-deploy.

Scope:
- Production build assembles Next.js static export into NestJS artifact.
- NestJS serves static routes/assets plus `/api/v1`, `/docs`, `/docs-json`, `/health` without API fallback collision.
- Startup order: prisma migrate deploy, seed-if-empty, start NestJS.
- Environment documentation for pooled DATABASE_URL, direct DIRECT_URL, secrets, base URL, port.
- Render configuration and step-by-step manual dashboard checklist if needed.
- Smoke-test script or documented command for health, docs, direct routes, cookie, checkout, payment, persistence.
- Document cold start, ephemeral filesystem, Neon limit, and no automatic paid overage assumption.

Constraints:
- Do not create Render/Neon accounts, request credentials, push, deploy, or execute remote migrations.
- Do not add another service, provider, reverse proxy, object storage, real payment, or external monitoring.
- Never seed destructively on startup.

Acceptance criteria:
- Production artifact runs locally in the same topology intended for Render.
- Direct Product/Article routes and query Order/payment routes resolve correctly.
- Static frontend and API share one origin and need no production CORS.
- Repository contains no secret.

Required checks:
- Build production artifact from clean workspace.
- Run it locally against disposable PostgreSQL and execute deployment smoke flow.
- Secret scan of changed files, lint, typecheck, tests relevant to serving paths.

Handoff:
Laporkan files/configuration, exact manual deployment steps, local production smoke evidence, provider assumptions, dan actions that still require the user. Jangan deploy.
```

## Phase 13: Final architecture and release-readiness review

```text
Lakukan final integrated review dan focused fixes untuk Mini E-Commerce. Ini review terakhir, bukan izin commit, push, atau deploy.

Gunakan code-review, codebase-design, dan Ponytail review principles bila tersedia. Jika skill review memerlukan baseline commit yang tidak tersedia, review seluruh current repository terhadap plan secara langsung.

Required reading:
- Semua AGENTS.md yang berlaku.
- CONTEXT.md.
- docs/architecture/fullstack-plan.md.
- docs/research/free-no-card-stack.md.
- Seluruh phase handoffs dan current repository diff/status.

Trace these journeys end-to-end in code and tests:
1. Anonymous browse to Add to Cart.
2. Concurrent Cart mutation.
3. Idempotent checkout and stock race.
4. Payment failure then retry on same Order.
5. Signed success webhook versus expiry race.
6. Static production build served from NestJS.

Review axes:
- Spec compliance and out-of-scope discipline.
- Domain terminology and state invariants.
- PostgreSQL transaction and constraint correctness.
- HTTP/OpenAPI/types consistency.
- Guest ownership, cookie, Origin, validation, webhook, replay, and logging security.
- Frontend state ownership, hydration, Cart reconciliation, loading/error states.
- Accessibility, responsive behavior, reduced motion, and direct-route behavior.
- Free/no-card deployment assumptions and absence of accidental external dependency.
- Over-engineering, dead abstractions, duplicated state/types, and unnecessary dependencies.

Action:
Fix high-confidence correctness, security, accessibility, contract, or scope defects. Remove confirmed unnecessary complexity where safe. Add the smallest regression proof for each non-trivial fix. Do not add new product features.

Required checks:
- Clean database migration and deterministic seed.
- Full format, lint, typecheck, backend tests, OpenAPI/type drift, production build, and critical Playwright suite.
- Review final git diff for secrets, generated noise, unrelated changes, and documentation drift.

Final handoff:
- Outcome first.
- Changed files grouped by concern.
- Full checks and results.
- Remaining known risks or unrun checks with reasons.
- Exact manual steps still required for optional Render/Neon deployment.
- Explicit confirmation that no commit, push, deployment, or external account action occurred.
```

## Completion rule

Setelah Phase 13 lulus, local implementation adalah deliverable utama yang selesai. Public deployment tetap langkah opsional milik user karena memerlukan pembuatan akun dan pengelolaan credentials di luar repository.
