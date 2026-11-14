"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "@/lib/brand";

// Every accounting page, in the order the owner thinks about the money.
// /summary is built by the acctcore track and 404s until that lands.
const ITEMS: { href: string; label: string }[] = [
  { href: "/admin/accounting", label: "Overview" },
  { href: "/admin/accounting/summary", label: "Summary" },
  { href: "/admin/accounting/sales", label: "Sales" },
  { href: "/admin/accounting/expenses", label: "Expenses" },
  { href: "/admin/accounting/income", label: "Income" },
  { href: "/admin/accounting/assets", label: "Assets" },
  { href: "/admin/accounting/payouts", label: "Transfers" },
  { href: "/admin/accounting/paypal", label: "PayPal" },
  { href: "/admin/accounting/import", label: "Import invoice" },
];

export function AccountingSubnav() {
  const path = usePathname() ?? "";
  const isActive = (href: string) =>
    href === "/admin/accounting" ? path === href : path === href || path.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Accounting sections"
      className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1"
    >
      {ITEMS.map((i) => {
        const on = isActive(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={on ? "page" : undefined}
            className="inline-flex items-center rounded-full border-2 px-4 text-sm font-semibold whitespace-nowrap min-h-[44px]"
            style={{
              borderColor: on ? BRAND.ink : `${BRAND.ink}33`,
              backgroundColor: on ? BRAND.ink : "transparent",
              color: on ? "#ffffff" : BRAND.ink,
            }}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
