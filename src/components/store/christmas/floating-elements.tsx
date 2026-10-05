import styles from "./christmas.module.css";

/**
 * Drifting snowflakes, stars, candy canes, gifts and baubles behind the hero.
 * Positions are fixed (no Math.random) so server and client markup match.
 * Purely decorative: aria-hidden, no pointer events, off under reduced motion.
 */

const GLYPHS = ["❄", "❅", "❆", "✦", "🎁", "🍬", "🔔", "⭐", "🎄", "🧦"] as const;

// [x%, size px, fall seconds, delay seconds, opacity, resting y% (reduced motion)]
const ITEMS: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [4, 22, 16, 0, 0.9, 12],
  [11, 14, 22, 3, 0.7, 40],
  [18, 30, 19, 6, 0.95, 70],
  [26, 16, 25, 1, 0.65, 25],
  [33, 20, 17, 9, 0.85, 55],
  [40, 12, 28, 4, 0.6, 80],
  [47, 26, 21, 12, 0.9, 18],
  [54, 16, 24, 2, 0.7, 62],
  [61, 32, 18, 7, 0.95, 35],
  [68, 14, 26, 10, 0.6, 88],
  [75, 22, 20, 5, 0.85, 48],
  [82, 18, 23, 14, 0.75, 15],
  [89, 28, 17, 8, 0.9, 72],
  [95, 14, 27, 11, 0.6, 30],
  [8, 18, 29, 15, 0.7, 90],
  [58, 12, 30, 13, 0.55, 8],
];

export function FloatingElements() {
  return (
    <div className={styles.floaters} aria-hidden="true">
      {ITEMS.map(([x, s, d, delay, o, y], i) => (
        <span
          key={i}
          className={styles.floater}
          style={
            {
              "--x": `${x}%`,
              "--s": `${s}px`,
              "--d": `${d}s`,
              "--delay": `-${delay}s`,
              "--o": o,
              "--y": `${y}%`,
            } as React.CSSProperties
          }
        >
          {GLYPHS[i % GLYPHS.length]}
        </span>
      ))}
    </div>
  );
}
