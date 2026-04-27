"use client";

/**
 * Phase 19 (19-06) — Generic SVG name-strip preview for made-to-order products.
 *
 * Renders a horizontal row of keycap SVG shapes (rounded squares), one per
 * character, filled with `baseHex`, with the character rendered on top in
 * `letterHex`. Empty slots (when text.length < maxLength) are faint outlines.
 *
 * Works for any text-driven product — not keychain-specific. The ring on the
 * left is a universal keychain metaphor matching the demo design.
 *
 * Stateless — no state or side effects.
 */

type Props = {
  /** Already uppercased and trimmed text to display. */
  text: string;
  /** Hex fill for each keycap (base colour). Default: zinc-400 (#a1a1aa) */
  baseHex: string;
  /** Hex for character on top of cap (letter colour). Default: white (#ffffff) */
  letterHex: string;
  /** Maximum number of characters (determines SVG width and empty slot count). */
  maxLength: number;
};

const CAP_SIZE = 56;
const CAP_GAP = 8;
const CAP_RX = 10;
const RING_R = 16;
const RING_STROKE = 5;
// Left padding for ring; ring takes ~RING_R*2 + gap before first cap
const LEFT_PAD = RING_R * 2 + CAP_GAP + 4;
const SVG_HEIGHT = 80;
const SVG_TOP_PAD = (SVG_HEIGHT - CAP_SIZE) / 2; // vertically centred

/**
 * Compute the viewBox width based on maxLength + ring + gaps.
 */
function svgWidth(maxLength: number): number {
  return LEFT_PAD + maxLength * (CAP_SIZE + CAP_GAP) + CAP_GAP;
}

export function KeychainPreview({ text, baseHex, letterHex, maxLength }: Props) {
  const chars = text.slice(0, maxLength).split("");
  const total = Math.max(maxLength, 1);
  const width = svgWidth(total);
  const ringCy = SVG_HEIGHT / 2;
  const ringCx = RING_R + 4;

  return (
    <svg
      viewBox={`0 0 ${width} ${SVG_HEIGHT}`}
      width="100%"
      aria-label={text ? `Preview shows ${text}` : "Type your name to see preview"}
      role="img"
      style={{ display: "block", maxWidth: total * (CAP_SIZE + CAP_GAP) + LEFT_PAD }}
    >
      {/* Keychain ring — same fill as base */}
      <circle
        cx={ringCx}
        cy={ringCy}
        r={RING_R}
        stroke={baseHex}
        strokeWidth={RING_STROKE}
        fill="none"
      />

      {/* Keycap slots */}
      {Array.from({ length: total }, (_, i) => {
        const ch = chars[i] ?? "";
        const isEmpty = ch === "";
        const x = LEFT_PAD + i * (CAP_SIZE + CAP_GAP);
        const y = SVG_TOP_PAD;

        return (
          <g key={i}>
            {/* Outer cap */}
            <rect
              x={x}
              y={y}
              width={CAP_SIZE}
              height={CAP_SIZE}
              rx={CAP_RX}
              fill={isEmpty ? "none" : baseHex}
              stroke={isEmpty ? "#d1d5db" : baseHex}
              strokeWidth={isEmpty ? 1.5 : 0}
              opacity={isEmpty ? 0.5 : 1}
            />
            {/* Highlight shimmer (non-empty caps only) */}
            {!isEmpty && (
              <rect
                x={x + 6}
                y={y + 6}
                width={CAP_SIZE - 12}
                height={14}
                rx={5}
                fill="rgba(255,255,255,0.18)"
              />
            )}
            {/* Character */}
            {!isEmpty && (
              <text
                x={x + CAP_SIZE / 2}
                y={y + CAP_SIZE / 2 + 9}
                textAnchor="middle"
                fill={letterHex}
                fontSize={22}
                fontWeight="800"
                fontFamily="Chakra Petch, ui-sans-serif, system-ui, sans-serif"
                style={{ userSelect: "none" }}
              >
                {ch}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
