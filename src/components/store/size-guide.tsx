// Phase 16-07: dimension columns dropped from product_variants.
// SizeGuide previously rendered width/height/depth per size; those values
// no longer exist. Component stubbed to null so existing import sites
// compile without touching the PDP layout.
export function SizeGuide(_props: { variants: unknown[] }) {
  return null;
}
