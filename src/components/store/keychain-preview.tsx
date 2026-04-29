"use client";

/**
 * Phase 19 / keychain — CSS-cube row preview for keychain products.
 *
 * Renders a horizontal row of 3-layer CSS "cubes"
 * (base shell + inset clicker face + raised letter glyph).
 *
 * Behaviour:
 *   - When text is empty: shows a SINGLE filled cube as a colour swatch
 *     (no letter glyph on it).
 *   - When text has chars: renders exactly chars.length cubes — no trailing
 *     empty placeholders.
 *   - Container expands via flex as cubes are added.
 *   - Fluid cube sizing via clamp() so 8 cubes always fit on any screen
 *     without horizontal scroll.
 *
 * Props:
 *   text        — already uppercased & trimmed string to display
 *   baseHex     — hex for the outer keycap shell + side-tab
 *   clickerHex  — hex for the inset pressable face (5 px lip)
 *   letterHex   — hex for the raised glyph text
 *   maxLength   — maximum number of cubes (used for fluid sizing denominator)
 *   placeholder — when text is empty AND placeholder is non-empty, render the
 *                 placeholder letters so the customer sees a sample keychain.
 *                 Empty string (default) disables the placeholder (single
 *                 swatch cube fallback).
 */

type Props = {
  text: string;
  baseHex: string;
  clickerHex: string;
  letterHex: string;
  maxLength: number;
  /**
   * When `text` is empty AND placeholder is non-empty, render the placeholder
   * letters in the cubes so the customer sees a sample of their keychain.
   * Empty string disables the placeholder (single swatch cube fallback).
   */
  placeholder?: string;
};

export function KeychainPreview({ text, baseHex, clickerHex, letterHex, maxLength, placeholder = "" }: Props) {
  const display = text || placeholder;
  const chars = display.slice(0, maxLength).split("").filter(Boolean);

  // When display is empty: show one swatch cube (no letter). Otherwise show chars.
  const isSwatch = chars.length === 0;
  const cubeCount = isSwatch ? 1 : chars.length;

  // Fluid cube size: fits maxLength+1 cubes across the actual container width.
  // Uses CSS container queries (100cqw) so sizing tracks the card, not the viewport.
  // Slot denominator: maxLength+1 reserves one slot for the ring/loop tab on cube #1.
  // Subtract 2px to account for 1px gap × 2 sides.
  // clamp: min 28px (8 cubes fit in ~280px narrow gallery), max 56px.
  const cubeSizeExpr = `clamp(28px, calc(100cqw / ${maxLength + 1} - 2px), 56px)`;

  // Letter font scales with cube: ~42% of cube width, leaving room for border + inset face.
  const fontSizeExpr = `clamp(13px, calc(100cqw / ${maxLength + 1} * 0.42), 26px)`;

  return (
    // The outer hero container in ConfigurableImageGallery now owns the
    // containerType: "inline-size" so 100cqw resolves to the full hero width.
    // This wrapper is kept for the thumbstrip miniature which renders
    // previewSlot outside the hero; the inner containerType there still helps.
    <div style={{ containerType: "inline-size", width: "100%" }}>
      {/* Centering wrapper: offsets the 26px left-padding so the visible cube
          row is optically centred in the hero square despite the ring tab
          hanging left of cube #1. */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
      <div
        data-keychain-preview
        aria-label={display ? `Preview shows: ${display}` : "Colour swatch preview"}
        role="img"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          paddingLeft: 26,      // room for side-tab/ring on first cube
          overflowX: "visible",
          overflowY: "visible",
          paddingTop: 12,
          paddingBottom: 20,    // room for drop shadow
        }}
      >
        {Array.from({ length: cubeCount }, (_, i) => {
          const ch = isSwatch ? "" : (chars[i] ?? "");
          const isFirst = i === 0;

          return (
            <div
              key={i}
              style={{
                position: "relative",
                width: cubeSizeExpr,
                height: cubeSizeExpr,
                flexShrink: 0,
                borderRadius: 14,
                background: baseHex,
                border: "none",
                // Body bevel — top highlight, side shadow, bottom drop
                boxShadow: `inset 3px 3px 5px rgba(255,255,255,0.45),
                           inset -3px -3px 5px rgba(0,0,0,0.14),
                           0 4px 0 rgba(0,0,0,0.10),
                           0 8px 14px rgba(0,0,0,0.10)`,
              }}
            >
              {/* Side-tab (ring/loop) — first cube only, fixed 28×32 px */}
              {isFirst && (
                <div
                  style={{
                    position: "absolute",
                    left: -22,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 28,
                    height: 32,
                    borderRadius: "14px 0 0 14px",
                    background: baseHex,
                    boxShadow: `inset 4px 4px 7px rgba(255,255,255,0.50),
                                 inset -5px -5px 8px rgba(0,0,0,0.16),
                                 0 5px 0 rgba(0,0,0,0.10)`,
                  }}
                >
                  {/* Loop dot */}
                  <div
                    style={{
                      position: "absolute",
                      left: 5,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "#ffffff",
                      boxShadow: "inset 2px 2px 4px rgba(0,0,0,0.16)",
                    }}
                  />
                </div>
              )}

              {/* Inset clicker face */}
              <div
                style={{
                  position: "absolute",
                  inset: 5,
                  borderRadius: 10,
                  background: clickerHex,
                  boxShadow: `inset 2px 2px 4px rgba(255,255,255,0.38),
                               inset -2px -2px 4px rgba(0,0,0,0.14)`,
                }}
              />

              {/* Raised letter glyph — only when there is a character */}
              {ch && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: letterHex,
                    fontSize: fontSizeExpr,
                    fontWeight: 900,
                    lineHeight: 1,
                    textTransform: "uppercase",
                    letterSpacing: "0.01em",
                    zIndex: 2,
                    userSelect: "none",
                    textShadow: `0 1px 0 rgba(0,0,0,0.08),
                                 0 2px 0 rgba(0,0,0,0.06),
                                 0 3px 0 rgba(0,0,0,0.04),
                                 0 4px 8px rgba(0,0,0,0.18)`,
                    fontFamily: "Chakra Petch, ui-sans-serif, system-ui, sans-serif",
                  }}
                  aria-hidden="true"
                >
                  {ch}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
