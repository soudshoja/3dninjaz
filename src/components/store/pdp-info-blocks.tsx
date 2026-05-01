/**
 * Shared PDP info blocks — render under "Material & Craft" on every PDP
 * (stocked, configurable, keychain, vending, simple).
 *
 * Two pure presentational sub-blocks:
 *   - <PdpProductCare />  : warm/soapy water care + choking hazard note
 *   - <PdpColourNote />   : filament variance + gradient stripe disclaimer
 *
 * Visual contract:
 *   - Sub-heading mirrors Material & Craft's "Material:" line — same font weight
 *     (font-bold) but slightly smaller than the section H2. Uses BRAND.ink.
 *   - Body paragraphs mirror existing Material body — text-sm, text-zinc tone,
 *     leading-relaxed. Multiple paragraphs separated by margin spacing.
 *   - No icons; sub-blocks are plain text.
 */

import { BRAND } from "@/lib/brand";

const SUBHEADING_CLASS =
  "text-base font-bold mb-2 mt-5";
const PARAGRAPH_CLASS =
  "text-sm leading-relaxed";

export function PdpProductCare() {
  return (
    <section aria-labelledby="pdp-product-care-heading">
      <h3
        id="pdp-product-care-heading"
        className={SUBHEADING_CLASS}
        style={{ color: BRAND.ink }}
      >
        Product Care
      </h3>
      <p className={PARAGRAPH_CLASS} style={{ color: "#374151" }}>
        3D printed items are created by heat &amp; as such it&apos;s their biggest enemy: no dishwashers, heaters or windowsills or else they may warp.
      </p>
      <p className={`${PARAGRAPH_CLASS} mt-2`} style={{ color: "#374151" }}>
        You can clean them with warm soapy water, a toothbrush &amp; leave to air dry.
      </p>
      <p className={`${PARAGRAPH_CLASS} mt-2`} style={{ color: "#374151" }}>
        None of our items are intended for small children they contain small parts &amp; may present a choking hazard. Please be gentle with them, keep them away from small children especially under 3.
      </p>
    </section>
  );
}

export function PdpColourNote() {
  return (
    <section aria-labelledby="pdp-colour-note-heading">
      <h3
        id="pdp-colour-note-heading"
        className={SUBHEADING_CLASS}
        style={{ color: BRAND.ink }}
      >
        Colour
      </h3>
      <p className={PARAGRAPH_CLASS} style={{ color: "#374151" }}>
        Every roll of printing filament is a little different &ndash; your print will be as close as possible to the photo but there may be some minor variance.
      </p>
      <p className={`${PARAGRAPH_CLASS} mt-2`} style={{ color: "#374151" }}>
        When your print has a gradient, the stripes may fall in slightly different places.
      </p>
    </section>
  );
}
