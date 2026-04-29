"use client";

/**
 * Phase 19 / keychain — CSS-cube row preview for keychain products.
 *
 * Replaces the old SVG strip. Renders a horizontal row of 3-layer CSS "cubes"
 * (base shell + inset clicker face + raised letter glyph) matching the design
 * contract in public/demo/clicker-customizer.html lines ~264-344.
 *
 * Props:
 *   text        — already uppercased & trimmed string to display
 *   baseHex     — hex for the outer keycap shell + side-tab
 *   clickerHex  — hex for the inset pressable face (5 px lip)
 *   letterHex   — hex for the raised glyph text
 *   maxLength   — total slot count (filled + empty)
 *
 * Stateless. Accepts width:100% semantics inside its container.
 */

type Props = {
  text: string;
  baseHex: string;
  clickerHex: string;
  letterHex: string;
  maxLength: number;
};

// Cube sizing — 64 px desktop, 50 px mobile (via CSS variable set on wrapper)
const CUBE_SIZE_D = 64;

export function KeychainPreview({ text, baseHex, clickerHex, letterHex, maxLength }: Props) {
  const chars = text.slice(0, maxLength).split("");
  const total = Math.max(maxLength, 1);

  return (
    <div
      data-keychain-preview
      aria-label={text ? `Preview shows: ${text}` : "Type your name to see preview"}
      role="img"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        paddingLeft: 26,         // room for side-tab on first cube
        overflowX: "auto",
        overflowY: "visible",
        paddingTop: 12,
        paddingBottom: 20,       // room for drop shadow
      }}
    >
      {Array.from({ length: total }, (_, i) => {
        const ch = chars[i] ?? "";
        const isEmpty = ch === "";
        const isFirst = i === 0;

        return (
          <div
            key={i}
            style={{
              position: "relative",
              width: CUBE_SIZE_D,
              height: CUBE_SIZE_D,
              flexShrink: 0,
              borderRadius: 14,
              background: isEmpty ? "transparent" : baseHex,
              border: isEmpty ? "1.5px dashed #d1d5db" : "none",
              opacity: isEmpty ? 0.45 : 1,
              // Body bevel — top highlight, side shadow, bottom drop
              boxShadow: isEmpty
                ? "none"
                : `inset 3px 3px 5px rgba(255,255,255,0.45),
                   inset -3px -3px 5px rgba(0,0,0,0.14),
                   0 4px 0 rgba(0,0,0,0.10),
                   0 8px 14px rgba(0,0,0,0.10)`,
            }}
          >
            {/* Side-tab (ring/loop) — first cube only, same base colour */}
            {isFirst && !isEmpty && (
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

            {/* Inset clicker face — only on filled cubes */}
            {!isEmpty && (
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
            )}

            {/* Raised letter glyph — only on filled cubes */}
            {!isEmpty && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: letterHex,
                  fontSize: 30,
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

      <style>{`
        @media (max-width: 560px) {
          /* Scale down cubes on small screens by targeting the flex children
             of the preview container via a scoped class added to wrapper.
             We use a data-attr selector to avoid global pollution. */
          [data-keychain-preview] > div {
            width: 50px !important;
            height: 50px !important;
          }
        }
      `}</style>
    </div>
  );
}
