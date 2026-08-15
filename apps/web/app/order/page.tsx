import { Suspense } from "react";

import { OrderBrowser } from "@/components/order-browser";

export default function OrderPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <p>Memuat route Order...</p>
        </div>
      }
    >
      <OrderBrowser />
    </Suspense>
  );
}
