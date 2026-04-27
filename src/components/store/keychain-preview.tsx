"use client";

/**
 * Phase 19 (19-06) — Generic SVG name-strip preview for made-to-order products.
 *
 * Renders a VERTICAL stack of keycap SVG shapes (rounded squares), one per
 * character, filled with `baseHex`, with the character rendered on top in
 * `letterHex`. Empty slots (when text.length < maxLength) are faint outlines.
 *
 * Top: carabiner D-ring clip (filled with `baseHex`) — matches physical product.
 * Middle: letter keycaps stacked vertically.
 * Bottom: base cube (same size as letter keycaps, no letter) filled with `baseHex`.
 *
 * Works for any text-driven product — not keychain-specific.
 *
 * Stateless — no state or side effects.
 */

type Props = {
  /** Already uppercased and trimmed text to display. */
  text: string;
  /** Hex fill for each keycap, carabiner, and base cube (base colour). Default: zinc-400 (#a1a1aa) */
  baseHex: string;
  /** Hex for character on top of cap (letter colour). Default: white (#ffffff) */
  letterHex: string;
  /** Maximum number of characters (determines SVG height and empty slot count). */
  maxLength: number;
};

const CAP_SIZE = 56;
const CAP_GAP = 6;
const CAP_RX = 10;

// Carabiner clip geometry (sits above the first keycap)
const CLIP_WIDTH = 28;
const CLIP_HEIGHT = 36;
const CLIP_STROKE = 5;
const CLIP_NECK_H = 8; // straight connector between clip and first keycap

// SVG horizontal width
const SVG_WIDTH = CAP_SIZE + 32; // some left+right padding
const CAP_X = (SVG_WIDTH - CAP_SIZE) / 2; // horizontally centred

// Clip centre x
const CLIP_CX = SVG_WIDTH / 2;
// Clip top y
const CLIP_TOP_Y = 6;
// Clip bottom y
const CLIP_BOTTOM_Y = CLIP_TOP_Y + CLIP_HEIGHT;
// Connector line: clip bottom to first keycap top
const CONNECTOR_TOP_Y = CLIP_BOTTOM_Y;
const CONNECTOR_BOTTOM_Y = CONNECTOR_TOP_Y + CLIP_NECK_H;
// First keycap top
const FIRST_CAP_Y = CONNECTOR_BOTTOM_Y;

/**
 * Compute total SVG height.
 * Slot count = maxLength letter slots + 1 base cube slot.
 */
function svgHeight(slotCount: number): number {
  const totalCaps = slotCount + 1; // +1 for base cube
  return FIRST_CAP_Y + totalCaps * (CAP_SIZE + CAP_GAP) + CAP_GAP;
}

export function KeychainPreview({ text, baseHex, letterHex, maxLength }: Props) {
  const chars = text.slice(0, maxLength).split("");
  const total = Math.max(maxLength, 1);
  const height = svgHeight(total);

  // Darken baseHex slightly for stroke (simple approach: reduce opacity)
  const strokeColor = baseHex;

  return (
    <svg
      viewBox={`0 0 ${SVG_WIDTH} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-label={text ? `Preview shows ${text}` : "Type your name to see preview"}
      role="img"
      style={{
        display: "block",
        height: "auto",
        width: "auto",
        maxHeight: "min(70vh, 520px)",
        maxWidth: "100%",
        margin: "0 auto",
      }}
    >
      {/* ── Carabiner D-ring clip at top ── */}
      {/* Outer D-ring: ellipse outline */}
      <ellipse
        cx={CLIP_CX}
        cy={CLIP_TOP_Y + CLIP_HEIGHT / 2}
        rx={CLIP_WIDTH / 2}
        ry={CLIP_HEIGHT / 2}
        fill={baseHex}
        stroke="rgba(0,0,0,0.15)"
        strokeWidth={1.5}
      />
      {/* Inner cutout to make it look like a ring */}
      <ellipse
        cx={CLIP_CX}
        cy={CLIP_TOP_Y + CLIP_HEIGHT / 2}
        rx={CLIP_WIDTH / 2 - CLIP_STROKE}
        ry={CLIP_HEIGHT / 2 - CLIP_STROKE}
        fill="white"
        opacity={0.55}
      />
      {/* Clicker gate bar (bottom of the D-ring) */}
      <rect
        x={CLIP_CX - CLIP_WIDTH / 2 - 2}
        y={CLIP_TOP_Y + CLIP_HEIGHT - CLIP_STROKE - 1}
        width={CLIP_WIDTH + 4}
        height={CLIP_STROKE + 2}
        rx={3}
        fill={baseHex}
        stroke="rgba(0,0,0,0.12)"
        strokeWidth={1}
      />

      {/* ── Connector neck between clip and first keycap ── */}
      <rect
        x={CLIP_CX - 4}
        y={CONNECTOR_TOP_Y}
        width={8}
        height={CLIP_NECK_H}
        rx={2}
        fill={baseHex}
        opacity={0.7}
      />

      {/* ── Letter keycap slots ── */}
      {Array.from({ length: total }, (_, i) => {
        const ch = chars[i] ?? "";
        const isEmpty = ch === "";
        const y = FIRST_CAP_Y + i * (CAP_SIZE + CAP_GAP);

        return (
          <g key={i}>
            {/* Outer cap */}
            <rect
              x={CAP_X}
              y={y}
              width={CAP_SIZE}
              height={CAP_SIZE}
              rx={CAP_RX}
              fill={isEmpty ? "none" : baseHex}
              stroke={isEmpty ? "#d1d5db" : strokeColor}
              strokeWidth={isEmpty ? 1.5 : 0}
              opacity={isEmpty ? 0.5 : 1}
            />
            {/* Highlight shimmer (non-empty caps only) */}
            {!isEmpty && (
              <rect
                x={CAP_X + 6}
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
                x={CAP_X + CAP_SIZE / 2}
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

      {/* ── Base cube at the bottom ── */}
      {(() => {
        const y = FIRST_CAP_Y + total * (CAP_SIZE + CAP_GAP);
        return (
          <g>
            <rect
              x={CAP_X}
              y={y}
              width={CAP_SIZE}
              height={CAP_SIZE}
              rx={CAP_RX}
              fill={baseHex}
              stroke="rgba(0,0,0,0.10)"
              strokeWidth={1}
            />
            {/* Highlight shimmer on base cube */}
            <rect
              x={CAP_X + 6}
              y={y + 6}
              width={CAP_SIZE - 12}
              height={14}
              rx={5}
              fill="rgba(255,255,255,0.18)"
            />
            {/* Small dot to hint it's the base/clicker end */}
            <circle
              cx={CAP_X + CAP_SIZE / 2}
              cy={y + CAP_SIZE / 2}
              r={5}
              fill={letterHex}
              opacity={0.5}
            />
          </g>
        );
      })()}
    </svg>
  );
}
