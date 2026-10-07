import { ChristmasPageV1 } from "@/components/store/christmas-v1/christmas-page-v1";
import { FIXTURE_GIFTS } from "@/components/store/christmas-v1/fixtures";

// Preview of variant 1 "Night shift". Fixtures only: this route never calls
// the database, so it renders without a DB connection.
export default function XmasPreviewV1() {
  return <ChristmasPageV1 products={FIXTURE_GIFTS} />;
}
