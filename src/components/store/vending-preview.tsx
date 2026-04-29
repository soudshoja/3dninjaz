"use client";

/**
 * Vending Machine — 2-tone live preview SVG.
 *
 * Re-paints in real time as the customer picks Primary / Secondary colours.
 *   Primary   — body, back panel behind honeycomb screen
 *   Secondary — frame around screen, dispenser knob, slot, tray, base
 *
 * Sized fluidly: width 100% of parent, height auto via viewBox.
 * White card background is opt-in via the wrapping element in the gallery
 * (the SVG itself paints a solid white rect for clean shots when isolated).
 */

type Props = {
  primaryHex: string;
  secondaryHex: string;
  /** Optional accessible label override. */
  label?: string;
};

export function VendingPreview({ primaryHex, secondaryHex, label }: Props) {
  const ariaLabel =
    label ??
    `Vending machine preview — primary ${primaryHex}, secondary ${secondaryHex}`;

  return (
    <div
      style={{
        containerType: "inline-size",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        viewBox="0 0 500 800"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "auto", maxWidth: 600, display: "block" }}
      >
        <defs>
          {/* Pointy-top hexagonal honeycomb pattern (side=10, tile 17.32x30). */}
          <pattern
            id="vending-hex"
            x="0"
            y="0"
            width="17.32"
            height="30"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 0,-10 L 8.66,-5 L 8.66,5 L 0,10 L -8.66,5 L -8.66,-5 Z"
              stroke="#ffffff"
              strokeWidth="1.4"
              fill="none"
            />
            <path
              d="M 8.66,5 L 17.32,10 L 17.32,20 L 8.66,25 L 0,20 L 0,10 Z"
              stroke="#ffffff"
              strokeWidth="1.4"
              fill="none"
            />
          </pattern>

          {/* Soft inner-shadow gradient for the screen recess (subtle depth). */}
          <radialGradient id="vending-screen-depth" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
          </radialGradient>

          {/* Highlight for the body — top-left soft sheen. */}
          <linearGradient id="vending-body-sheen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="55%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.12)" />
          </linearGradient>

          {/* Knob radial highlight. */}
          <radialGradient id="vending-knob-sheen" cx="35%" cy="32%" r="70%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.45)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
          </radialGradient>

          {/* Clip the honeycomb tiling to the screen panel only. */}
          <clipPath id="vending-screen-clip">
            <rect x="100" y="125" width="300" height="220" rx="24" />
          </clipPath>
        </defs>

        {/* White studio background */}
        <rect width="500" height="800" fill="#ffffff" />

        {/* ── Top cap (lid + small stem) ─────────────────────────────────── */}
        <rect x="225" y="55" width="50" height="22" rx="3" fill={primaryHex} />
        <ellipse cx="250" cy="52" rx="44" ry="12" fill={primaryHex} />
        {/* ridge highlight on cap */}
        <ellipse
          cx="250"
          cy="49"
          rx="40"
          ry="3"
          fill="rgba(255,255,255,0.28)"
        />
        <ellipse
          cx="250"
          cy="55"
          rx="44"
          ry="12"
          fill="none"
          stroke="rgba(0,0,0,0.12)"
          strokeWidth="1"
        />

        {/* ── Main upper body (rounded square housing the screen) ─────────── */}
        <rect x="50" y="75" width="400" height="320" rx="50" fill={primaryHex} />
        <rect
          x="50"
          y="75"
          width="400"
          height="320"
          rx="50"
          fill="url(#vending-body-sheen)"
        />

        {/* ── Frame around screen (secondary) ─────────────────────────────── */}
        <rect x="80" y="105" width="340" height="260" rx="38" fill={secondaryHex} />
        {/* subtle inner darken on frame for depth */}
        <rect
          x="80"
          y="105"
          width="340"
          height="260"
          rx="38"
          fill="none"
          stroke="rgba(0,0,0,0.10)"
          strokeWidth="2"
        />

        {/* ── Screen back panel (primary, inset inside frame) ─────────────── */}
        <rect x="100" y="125" width="300" height="220" rx="24" fill={primaryHex} />

        {/* Honeycomb pattern overlay (clipped to screen panel) */}
        <g clipPath="url(#vending-screen-clip)">
          <rect x="100" y="125" width="300" height="220" fill="url(#vending-hex)" />
        </g>

        {/* Screen depth shadow */}
        <rect
          x="100"
          y="125"
          width="300"
          height="220"
          rx="24"
          fill="url(#vending-screen-depth)"
        />

        {/* ── Lower body column (drops below the screen housing) ─────────── */}
        <rect x="125" y="395" width="250" height="295" rx="6" fill={primaryHex} />
        <rect
          x="125"
          y="395"
          width="250"
          height="295"
          rx="6"
          fill="url(#vending-body-sheen)"
        />

        {/* ── Dispenser knob — circular, sticks out the right side ───────── */}
        <circle cx="370" cy="455" r="44" fill={secondaryHex} />
        <circle cx="370" cy="455" r="44" fill="url(#vending-knob-sheen)" />
        {/* Wave / swirl detail inside knob — drawn in primary so it reads as
            the candy chute behind a transparent disc. */}
        <path
          d="M 338 455 Q 354 432 370 455 T 402 455"
          stroke={primaryHex}
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        {/* knob rim */}
        <circle
          cx="370"
          cy="455"
          r="44"
          fill="none"
          stroke="rgba(0,0,0,0.16)"
          strokeWidth="2"
        />

        {/* ── Arched dispenser slot ──────────────────────────────────────── */}
        <path
          d="M 175 690 L 175 600 Q 175 558 250 558 Q 325 558 325 600 L 325 690 Z"
          fill={secondaryHex}
        />
        {/* slot inner-shadow for depth */}
        <path
          d="M 195 690 L 195 610 Q 195 578 250 578 Q 305 578 305 610 L 305 670 Z"
          fill="rgba(0,0,0,0.20)"
        />

        {/* ── Tray + stand below the body ─────────────────────────────────── */}
        {/* Stand connecting tray to body */}
        <rect x="218" y="690" width="64" height="22" fill={secondaryHex} />
        {/* Tray (curved bowl, secondary) */}
        <path
          d="M 130 712 Q 130 760 250 760 Q 370 760 370 712 L 340 712 Q 340 738 250 738 Q 160 738 160 712 Z"
          fill={secondaryHex}
        />
        {/* Tray rim shadow */}
        <path
          d="M 160 712 Q 160 738 250 738 Q 340 738 340 712"
          fill="none"
          stroke="rgba(0,0,0,0.18)"
          strokeWidth="1.5"
        />
        {/* Tray base sheen */}
        <ellipse
          cx="250"
          cy="748"
          rx="100"
          ry="8"
          fill="rgba(0,0,0,0.10)"
        />
      </svg>
    </div>
  );
}
