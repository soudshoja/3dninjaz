import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { AccountingSubnav } from "@/components/admin/accounting/accounting-subnav";

// One sub-navigation for every /admin/accounting/* page. Each page keeps its
// own <main>; this wrapper only adds the nav strip above it on the same cream
// background.
export default function AccountingLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ backgroundColor: BRAND.cream }}>
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <AccountingSubnav />
      </div>
      {children}
    </div>
  );
}
