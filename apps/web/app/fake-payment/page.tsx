import { Suspense } from "react";

import { FakePaymentBrowser } from "@/components/fake-payment-browser";

export default function FakePaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <p>Memuat route Fake Payment...</p>
        </div>
      }
    >
      <FakePaymentBrowser />
    </Suspense>
  );
}
