"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cartItemCount, useCartBadge } from "@/lib/cart-query";

export function CartBadge() {
  const pathname = usePathname();
  const cart = useCartBadge(pathname !== "/cart");
  const itemCount = cartItemCount(cart.data?.data);

  return (
    <Link href="/cart" aria-label={`Keranjang, ${itemCount} item`}>
      Keranjang{" "}
      <span className="cart-badge" aria-hidden="true">
        {itemCount}
      </span>
    </Link>
  );
}
