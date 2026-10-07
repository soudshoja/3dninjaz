import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Shuriken } from "@/components/brand/shuriken";
import { ChristmasTreeIcon } from "./christmas-tree-icon";
import styles from "./christmas.module.css";

/**
 * Christmas hero. Same bones as the homepage Hero (white canvas, shurikens,
 * green pill, big heading, two pill buttons) with a few seasonal touches:
 * a small tree, gentle pale-blue snow dots and a candy-cane rule.
 *
 * Snow positions are fixed (no Math.random) so server and client markup match.
 */

// [x%, size px, fall seconds, delay seconds, sideways drift, resting y%]
const SNOW: ReadonlyArray<readonly [number, number, number, number, string, number]> = [
  [4, 6, 14, 0, "20px", 12],
  [11, 4, 18, 4, "-16px", 38],
  [19, 7, 16, 9, "24px", 64],
  [27, 4, 20, 2, "-12px", 22],
  [35, 6, 15, 11, "18px", 50],
  [43, 4, 19, 6, "-20px", 78],
  [51, 7, 17, 13, "14px", 30],
  [59, 4, 21, 1, "-18px", 58],
  [67, 6, 15, 8, "22px", 16],
  [75, 4, 19, 12, "-14px", 70],
  [83, 7, 16, 5, "16px", 44],
  [91, 5, 18, 10, "-22px", 26],
  [96, 4, 20, 3, "12px", 84],
];

export function ChristmasHero() {
  return (
    <section
      className="relative overflow-hidden bg-white"
      aria-labelledby="christmas-heading"
    >
      <div className={styles.snow} aria-hidden>
        {SNOW.map(([x, s, d, delay, dx, y], i) => (
          <span
            key={i}
            className={styles.flake}
            style={
              {
                "--x": `${x}%`,
                "--s": `${s}px`,
                "--d": `${d}s`,
                "--delay": `-${delay}s`,
                "--dx": dx,
                "--y": `${y}%`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <Shuriken
        className="absolute top-10 left-8 w-10 h-10 opacity-50 animate-spin-slow"
        fill={BRAND.green}
      />
      <Shuriken
        className="absolute top-24 right-16 w-14 h-14 opacity-40 animate-spin-slow"
        fill={BRAND.blue}
      />
      <Shuriken
        className="hidden sm:block absolute bottom-24 left-24 w-8 h-8 opacity-60 animate-spin-slow"
        fill="#D42426"
      />
      <Shuriken
        className="absolute bottom-32 right-10 w-12 h-12 opacity-40 animate-spin-slow"
        fill={BRAND.purple}
      />

      <div className="relative max-w-6xl mx-auto px-6 text-center pt-14 md:pt-20 pb-16 md:pb-20">
        <p
          className="inline-block rounded-full px-4 py-1 text-xs md:text-sm font-bold mb-8"
          style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
        >
          Christmas at 3D Ninjaz
        </p>
        <div className="flex justify-center mb-6">
          <ChristmasTreeIcon className="w-[110px] md:w-[140px] h-auto" />
        </div>
        <h1
          id="christmas-heading"
          className="font-[var(--font-heading)] tracking-tight text-4xl sm:text-5xl md:text-6xl leading-tight text-zinc-900"
        >
          Gifts made by kids, for kids.
          <br />
          <span style={{ color: BRAND.green }}>Merry ninja Christmas.</span>
        </h1>
        <p className="mt-6 text-base md:text-lg text-zinc-600 max-w-xl mx-auto">
          Christmas gifts 3D printed to order in Kuala Lumpur and shipped across
          Malaysia.
        </p>
        <div className="mt-10 flex flex-wrap gap-4 justify-center">
          <a
            href="#christmas-gifts"
            className="rounded-full px-8 py-4 font-bold text-lg shadow-[0_4px_0_rgba(11,16,32,0.15)] hover:translate-y-[2px] hover:shadow-[0_2px_0_rgba(11,16,32,0.15)] active:translate-y-[3px] transition min-h-[60px] inline-flex items-center"
            style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
          >
            Shop Christmas gifts
          </a>
          <Link
            href="/shop"
            className="rounded-full px-8 py-4 font-bold text-lg border-2 hover:bg-zinc-50 transition min-h-[60px] inline-flex items-center"
            style={{ borderColor: BRAND.blue, color: BRAND.blue }}
          >
            Shop everything
          </Link>
        </div>
      </div>

      <div className={styles.candy} aria-hidden />
    </section>
  );
}
