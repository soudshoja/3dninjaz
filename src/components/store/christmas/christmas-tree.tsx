import styles from "./christmas.module.css";

/**
 * Layer-line Christmas tree. Display piece only, not a product.
 * Each tier is striped horizontally so it reads as a 3D print, and the whole
 * thing "prints" bottom to top once on load (see .printReveal).
 */

const TIERS = [
  // [apex y, base y, half-width at base]
  { top: 70, bottom: 210, half: 92 },
  { top: 140, bottom: 300, half: 128 },
  { top: 225, bottom: 395, half: 162 },
  { top: 320, bottom: 490, half: 190 },
] as const;

const CX = 200;

const LIGHTS = [
  [168, 150, 0.0, "#ffc83d"],
  [226, 188, 0.4, "#e0242b"],
  [150, 232, 0.8, "#1877f2"],
  [250, 262, 1.2, "#ffc83d"],
  [128, 300, 1.6, "#7360f2"],
  [206, 332, 0.2, "#e0242b"],
  [272, 356, 0.6, "#ffc83d"],
  [112, 372, 1.0, "#1877f2"],
  [176, 404, 1.4, "#ffc83d"],
  [250, 428, 1.8, "#e0242b"],
  [90, 448, 0.3, "#7360f2"],
  [318, 462, 0.7, "#ffc83d"],
  [150, 470, 1.1, "#e0242b"],
  [226, 478, 1.5, "#1877f2"],
] as const;

export function ChristmasTree() {
  return (
    <div className={styles.printReveal}>
      <svg
        viewBox="0 0 400 560"
        role="img"
        aria-label="A Christmas tree built from stacked print layers, with twinkling lights"
        className="block w-full h-auto"
      >
        <defs>
          <linearGradient id="xmasPine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2fbf6c" />
            <stop offset="1" stopColor="#0f5c32" />
          </linearGradient>
          {/* Layer-line stripes laid over each tier. */}
          <pattern
            id="xmasLayers"
            width="8"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <rect width="8" height="2" y="4" fill="rgba(0,0,0,0.22)" />
            <rect width="8" height="1" y="3" fill="rgba(255,255,255,0.12)" />
          </pattern>
          <radialGradient id="xmasStarHalo" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffc83d" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffc83d" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="xmasStar" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff6c9" />
            <stop offset="1" stopColor="#ffc83d" />
          </radialGradient>
        </defs>

        {/* Trunk */}
        <rect x="170" y="486" width="60" height="58" rx="4" fill="#7a4a21" />
        <rect x="170" y="486" width="60" height="58" rx="4" fill="url(#xmasLayers)" />

        {/* Tiers, drawn back to front so lower tiers overlap upper ones. */}
        {TIERS.map((t, i) => {
          const d = `M ${CX} ${t.top} L ${CX + t.half} ${t.bottom} Q ${CX} ${t.bottom + 18} ${CX - t.half} ${t.bottom} Z`;
          return (
            <g key={i}>
              <path d={d} fill="url(#xmasPine)" />
              <path d={d} fill="url(#xmasLayers)" />
              <path
                d={d}
                fill="none"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1.5"
              />
            </g>
          );
        })}

        {/* String lights */}
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
        <g className={styles.starGlow}>
          <circle cx={CX} cy="56" r="46" fill="url(#xmasStarHalo)" />
          <path
            d="M 200 22 L 211 46 L 238 49 L 218 67 L 224 93 L 200 80 L 176 93 L 182 67 L 162 49 L 189 46 Z"
            fill="url(#xmasStar)"
            stroke="#ffb400"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  );
}
