import { ChristmasPageV3 } from "@/components/store/christmas-v3/christmas-page-v3";
import { FIXTURE_GIFTS } from "@/components/store/christmas-v3/fixtures";

// Preview route: no database, fixture products only.
// Dev-only testing hook: /xmas-preview/v3?progress=0.5 pins the scroll
// progress (0..1) so a headless screenshot can show intermediate print states.
// Ignored when NODE_ENV is "production".
export default async function PreviewV3({
  searchParams,
}: {
  searchParams: Promise<{ progress?: string }>;
}) {
  const { progress } = await searchParams;
  const n = progress === undefined ? NaN : Number(progress);
  const debugProgress =
    process.env.NODE_ENV !== "production" && Number.isFinite(n) ? n : undefined;

  return <ChristmasPageV3 products={FIXTURE_GIFTS} debugProgress={debugProgress} />;
}
