import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { Factory } from "lucide-react";
import { getProductionBoard, getKeychainBatches } from "@/actions/admin-production";
import { ProductionBoardView } from "@/components/admin/production-board";
import { KeychainBatchesView } from "@/components/admin/keychain-batches";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Production",
  robots: { index: false, follow: false },
};

export default async function AdminProductionPage() {
  await requireAdmin();
  const [board, keychainBatches] = await Promise.all([
    getProductionBoard(),
    getKeychainBatches(),
  ]);

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
        {/* ── Page header ── */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg"
              style={{ backgroundColor: BRAND.ink }}
            >
              <Factory size={22} className="text-white" />
            </div>
            <div>
              <h1
                className="font-[var(--font-heading)] text-3xl md:text-4xl font-extrabold tracking-tight"
                style={{ color: BRAND.ink }}
              >
                Production
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Paid orders to make. Tick each item as it&apos;s produced —
                orders move to Processed once every item is done.
              </p>
            </div>
          </div>
        </header>

        {/* ── Top-level tabs: board tabs vs keychain batches ── */}
        <Tabs defaultValue="board" className="flex-col gap-4">
          <TabsList variant="line" className="h-auto">
            <TabsTrigger value="board" className="px-3 py-2 text-sm">
              Production board
            </TabsTrigger>
            <TabsTrigger value="keychain" className="px-3 py-2 text-sm">
              Keychain batches
              {keychainBatches.assembly.length > 0 ? (
                <span
                  className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums"
                  style={{ background: `${BRAND.purple}18`, color: BRAND.purple }}
                >
                  {keychainBatches.assembly.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="board">
            <ProductionBoardView board={board} />
          </TabsContent>

          <TabsContent value="keychain">
            <KeychainBatchesView data={keychainBatches} />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
