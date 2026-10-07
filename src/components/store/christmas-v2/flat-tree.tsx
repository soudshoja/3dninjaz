import styles from "./christmas-v2.module.css";

/**
 * Flat layer-line tree, shown only when WebGL is unavailable. Display piece
 * only, not a product. Each tier is striped so it reads as a 3D print, and the
 * tree "prints" bottom to top once on load (see .printReveal).
 */

const TIERS = [
  // [apex y, base y, half-width at base]
  { top: 70, bottom: 210, half: 92 },
  { top: 140, bottom: 300, half: 128 },
  { top: 225, bottom: 395, half: 162 },
  { top: 320, bottom: 490, half: 190 },
] as const;

const CX = 200;

// [x, y, twinkle delay s, colour token]
const LIGHTS = [
  [168, 150, 0.0, "warm"],
  [226, 188, 0.4, "accent"],
  [150, 232, 0.8, "warm"],
  [250, 262, 1.2, "warm"],
  [128, 300, 1.6, "accent"],
  [206, 332, 0.2, "warm"],
  [272, 356, 0.6, "accent"],
  [112, 372, 1.0, "warm"],
  [176, 404, 1.4, "warm"],
  [250, 428, 1.8, "accent"],
  [90, 448, 0.3, "warm"],
  [318, 462, 0.7, "warm"],
  [150, 470, 1.1, "accent"],
  [226, 478, 1.5, "warm"],
] as const;

export function FlatTree() {
  return (
    <div className={styles.printReveal}>
      <svg
        viewBox="0 0 400 560"
        role="img"
        aria-label="A Christmas tree built from stacked print layers, with twinkling lights"
        className="block w-full h-auto"
      >
        <defs>
          <linearGradient id="xmas2Pine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--tree-top)" />
            <stop offset="1" stopColor="var(--tree-bottom)" />
          </linearGradient>
          {/* Layer-line stripes laid over each tier. */}
          <pattern id="xmas2Layers" width="8" height="6" patternUnits="userSpaceOnUse">
            <rect width="8" height="2" y="4" fill="oklch(0 0 0 / 0.22)" />
            <rect width="8" height="1" y="3" fill="oklch(1 0 0 / 0.12)" />
          </pattern>
          <radialGradient id="xmas2Halo" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.5" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Trunk */}
        <rect x="170" y="486" width="60" height="58" rx="4" fill="var(--trunk)" />
        <rect x="170" y="486" width="60" height="58" rx="4" fill="url(#xmas2Layers)" />

        {/* Tiers, drawn back to front so lower tiers overlap upper ones. */}
        {TIERS.map((t, i) => {
          const d = `M ${CX} ${t.top} L ${CX + t.half} ${t.bottom} Q ${CX} ${t.bottom + 18} ${CX - t.half} ${t.bottom} Z`;
          return (
            <g key={i}>
              <path d={d} fill="url(#xmas2Pine)" />
              <path d={d} fill="url(#xmas2Layers)" />
              <path d={d} fill="none" stroke="oklch(1 0 0 / 0.18)" strokeWidth="1.5" />
            </g>
          );
        })}

        {/* String lights */}
        {LIGHTS.map(([x, y, delay, tone], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="7"
            fill={tone === "accent" ? "var(--accent)" : "var(--warm-white)"}
            className={styles.twinkle}
            style={{ "--t": `${delay}s` } as React.CSSProperties}
          />
        ))}

        {/* Star */}
        <g className={styles.starGlow}>
          <circle cx={CX} cy="56" r="46" fill="url(#xmas2Halo)" />
          <path
            d="M 200 22 L 211 46 L 238 49 L 218 67 L 224 93 L 200 80 L 176 93 L 182 67 L 162 49 L 189 46 Z"
            fill="var(--accent)"
            stroke="var(--accent-press)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  );
}
