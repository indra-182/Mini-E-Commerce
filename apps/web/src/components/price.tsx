import type { components } from "@mini-ecommerce/api-types";

type Money = components["schemas"]["MoneyDto"];

const formatter = new Intl.NumberFormat("id-ID", {
  currency: "IDR",
  maximumFractionDigits: 0,
  style: "currency",
});

export function Price({ money }: Readonly<{ money: Money }>) {
  return <span className="price">{formatter.format(money.amount)}</span>;
}
