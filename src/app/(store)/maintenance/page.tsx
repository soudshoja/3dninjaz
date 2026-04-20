import type { Metadata } from "next";
import { BrandedMaintenance } from "@/components/error/branded-maintenance";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "3D Ninjaz — We'll be right back",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return <BrandedMaintenance />;
}
