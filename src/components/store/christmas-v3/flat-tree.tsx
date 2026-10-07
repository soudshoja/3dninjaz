import styles from "./christmas-v3.module.css";

/**
 * Finished, lit tree as flat SVG. Shown when the page is static: reduced
 * motion, no WebGL, or no JavaScript. Layer-line stripes keep the "3D printed"
 * read. Display piece only, not a product.
 */

const TIERS = [
  // [apex y, base y, half-width at base]
  { top: 70, bottom: 210, half: 92 },
  { top: 140, bottom: 300, half: 128 },
  { top: 225, bottom: 395, half: 162 },
  { top: 320, bottom: 490, half: 190 },
] as const;

const CX = 200;

// Warm white, filament orange and one cool white: the same three the 3D tree uses.
const WARM = "#fff1d6";
const ORANGE = "#ff8a2b";
const COOL = "#d8e6ff";

const LIGHTS = [
  [168, 150, 0.0, WARM],
  [226, 188, 0.4, ORANGE],
  [150, 232, 0.8, COOL],
  [250, 262, 1.2, WARM],
  [128, 300, 1.6, ORANGE],
  [206, 332, 0.2, WARM],
  [272, 356, 0.6, ORANGE],
  [112, 372, 1.0, COOL],
  [176, 404, 1.4, WARM],
  [250, 428, 1.8, ORANGE],
  [90, 448, 0.3, WARM],
  [318, 462, 0.7, COOL],
  [150, 470, 1.1, ORANGE],
  [226, 478, 1.5, WARM],
] as const;

export function FlatTree() {
  return (
    <svg
      viewBox="0 0 400 560"
      role="img"
      aria-label="A Christmas tree built from stacked print layers, with warm lights and a star"
      className={styles.flatSvg}
    >
      <defs>
        <linearGradient id="v3Pine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3ccf78" />
          <stop offset="1" stopColor="#0f5c32" />
        </linearGradient>
        <pattern id="v3Layers" width="8" height="6" patternUnits="userSpaceOnUse">
          <rect width="8" height="2" y="4" fill="rgba(0,0,0,0.24)" />
          <rect width="8" height="1" y="3" fill="rgba(255,255,255,0.12)" />
        </pattern>
        <radialGradient id="v3Halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={ORANGE} stopOpacity="0.5" />
          <stop offset="1" stopColor={ORANGE} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Trunk */}
      <rect x="170" y="486" width="60" height="58" rx="4" fill="#7a4a21" />
      <rect x="170" y="486" width="60" height="58" rx="4" fill="url(#v3Layers)" />

      {/* Tiers, drawn back to front so lower tiers overlap upper ones. */}
      {TIERS.map((t, i) => {
        const d = `M ${CX} ${t.top} L ${CX + t.half} ${t.bottom} Q ${CX} ${t.bottom + 18} ${CX - t.half} ${t.bottom} Z`;
        return (
          <g key={i}>
            <path d={d} fill="url(#v3Pine)" />
            <path d={d} fill="url(#v3Layers)" />
            <path d={d} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" />
          </g>
        );
      })}

      {/* Lights */}
      {LIGHTS.map(([x, y, delay, color], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r="7"
          fill={color}
          className={styles.twinkle}
          style={{ "--t": `${delay}s` } as React.CSSProperties}
        />
      ))}

      {/* Star */}
      <g>
        <circle cx={CX} cy="56" r="46" fill="url(#v3Halo)" />
        <path
          d="M 200 22 L 211 46 L 238 49 L 218 67 L 224 93 L 200 80 L 176 93 L 182 67 L 162 49 L 189 46 Z"
          fill={WARM}
          stroke={ORANGE}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
