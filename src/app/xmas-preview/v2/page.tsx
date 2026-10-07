import { ChristmasPageV2 } from "@/components/store/christmas-v2/christmas-page-v2";
import { FIXTURE_GIFTS } from "@/components/store/christmas-v2/fixtures";

// Preview only: fixture products, no database. Delete with the preview folder.
export default function ChristmasV2Preview() {
  return (
    <main>
      <ChristmasPageV2 products={FIXTURE_GIFTS} />
    </main>
  );
}
