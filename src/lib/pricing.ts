import type { DayOption, Training } from "@prisma/client";

export function basePriceCents(t: Pick<Training, "priceDay1" | "priceDay2" | "priceBoth">, opt: DayOption): number {
  if (opt === "DAY_1") return t.priceDay1;
  if (opt === "DAY_2") return t.priceDay2;
  return t.priceBoth;
}

export function finalPriceCents(base: number, discountBps: number): number {
  const bps = Math.max(0, Math.min(10000, discountBps));
  return Math.round((base * (10000 - bps)) / 10000);
}

export function formatEUR(cents: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function formatPct(bps: number): string {
  return (bps / 100).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " %";
}
