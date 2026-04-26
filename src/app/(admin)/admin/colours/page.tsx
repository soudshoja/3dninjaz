import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-helpers";
import { listColours } from "@/actions/admin-colours";
import { ColoursListClient } from "@/components/admin/colours-list-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Colours",
  robots: { index: false, follow: false },
};

export default async function AdminColoursPage() {
  await requireAdmin();
  const rows = await listColours();
  return <ColoursListClient rows={rows} />;
}
