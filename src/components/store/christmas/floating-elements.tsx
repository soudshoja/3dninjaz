import styles from "./christmas.module.css";

/**
 * Drifting snowflakes, stars, candy canes, gifts and baubles behind the hero.
 * Positions are fixed (no Math.random) so server and client markup match.
 * Purely decorative: aria-hidden, no pointer events, off under reduced motion.
 */

const GLYPHS = ["❄", "🎁", "❅", "⭐", "🔔", "❆", "🍬", "🎄", "✦", "🧦"] as const;

// [x%, size px, fall seconds, delay seconds, opacity, resting y% (reduced motion)]
const ITEMS: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [3, 34, 16, 0, 0.95, 12],
  [9, 22, 22, 3, 0.75, 40],
  [15, 42, 19, 6, 0.95, 70],
  [22, 26, 25, 1, 0.8, 25],
  [28, 36, 17, 9, 0.9, 55],
  [35, 20, 28, 4, 0.7, 80],
  [41, 40, 21, 12, 0.95, 18],
  [47, 24, 24, 2, 0.75, 62],
  [53, 38, 18, 7, 0.95, 35],
  [59, 22, 26, 10, 0.7, 88],
  [65, 34, 20, 5, 0.9, 48],
  [71, 28, 23, 14, 0.8, 15],
  [77, 44, 17, 8, 0.95, 72],
  [83, 22, 27, 11, 0.7, 30],
  [89, 36, 19, 3, 0.9, 58],
  [95, 26, 29, 15, 0.75, 90],
  [6, 28, 24, 13, 0.8, 8],
  [44, 30, 30, 16, 0.7, 45],
  [68, 20, 21, 17, 0.7, 66],
  [92, 40, 18, 9, 0.9, 22],
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
