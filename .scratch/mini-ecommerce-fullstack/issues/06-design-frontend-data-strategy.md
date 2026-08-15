Type: grilling
Status: resolved
Blocked by: 03, 05

## Question

How should Next.js divide URL state, local UI state, server state, rendering, caching, mutation reconciliation, and polling across article, catalog, cart, checkout, and order pages while remaining mobile-first and accessible?

## Answer

Use static generation for seeded Article pages, static shells plus fresh API reads for Product pages, and client rendering for session-specific Cart, checkout, Order, and fake-payment screens. Keep build-known Product and Article slugs as path segments; use query parameters for runtime Order and Payment Attempt UUIDs so Next.js static export needs no dynamic runtime routes.

Place filters and pagination in the URL, ephemeral controls and form drafts in local React state, Guest identity in the signed cookie, and server state in TanStack Query. Add no Redux, Zustand, Axios, React Hook Form, or duplicated client-side schema layer. Use a single controlled fixture source for static Article generation and database seeding.

Bootstrap a Cart only when a user opens it or adds an item. Never optimistically modify authoritative Cart price, inventory, or totals: send the current ETag, disable only the affected control, then replace the cached Cart with the server response. Reconcile 412 and checkout-drift problems with the returned current Cart. Keep one idempotency key per checkout intent in session storage until the request has a definitive outcome.

Poll awaiting Orders every two seconds only while the tab is visible, stop at terminal state or after two minutes, and provide manual refresh. Keep feature modules shallow, introduce only reused UI primitives, implement explicit loading/empty/error/state-transition screens, and meet mobile-first accessibility requirements including keyboard behavior, visible focus, live-region announcements, error focus management, adequate touch targets, and reduced motion.
