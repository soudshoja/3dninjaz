'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const BRAND = {
  blue: '#1151bf',
  green: '#50c878',
  purple: '#7021b0',
  ink: '#0B1020',
  cream: '#F7FAF4',
};

const TYPE_WORDS = ['Stealthy.', 'Colorful.', 'Yours.'];

const CATEGORIES = [
  { label: 'Keychains', bg: BRAND.blue, href: '#cat-keychains' },
  { label: 'Phone Stands', bg: BRAND.green, href: '#cat-stands' },
  { label: 'Desk Toys', bg: BRAND.purple, href: '#cat-toys' },
  { label: 'Planters', bg: BRAND.blue, href: '#cat-planters' },
  { label: 'Custom Nameplates', bg: BRAND.green, href: '#cat-nameplates' },
  { label: 'Cable Organizers', bg: BRAND.purple, href: '#cat-cables' },
];

const FEATURED = [
  {
    name: 'Shuriken Keychain',
    price: 'RM 18',
    accent: BRAND.blue,
    badge: 'NEW',
    countdown: false,
  },
  {
    name: 'Dragon Phone Stand',
    price: 'RM 45',
    accent: BRAND.green,
    badge: 'KID FAVE',
    countdown: true,
  },
  {
    name: 'Ninja Planter Pot',
    price: 'RM 32',
    accent: BRAND.purple,
    badge: 'BEST SELLER',
    countdown: false,
  },
];

const DROP_END = new Date('2026-05-01T12:00:00Z').getTime();

const TRUST_BADGES = ['Parents MY', 'Kids Today', 'Making Things', 'Print World', 'KL Families'];

/* ---------- SVGs ---------- */
function Shuriken({
  className = '',
  fill = BRAND.blue,
}: {
  className?: string;
  fill?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={fill} aria-hidden>
      <path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5z" />
    </svg>
  );
}

function Wave({ color, flip = false }: { color: string; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      className={`block w-full h-[60px] md:h-[100px] ${flip ? 'rotate-180' : ''}`}
      aria-hidden
    >
      <path
        d="M0,64 C240,112 480,16 720,48 C960,80 1200,128 1440,64 L1440,120 L0,120 Z"
        fill={color}
      />
    </svg>
  );
}

function ArrowIcon({ className = '', stroke = 'white' }: { className?: string; stroke?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Logo({ size = 44 }: { size?: number }) {
  return (
    <Image
      src="/logo.png"
      alt="3D Ninjaz"
      width={size}
      height={size}
      priority
      className="rounded-xl"
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
}

/* ---------- Typewriter ---------- */
function Typewriter() {
  const [mounted, setMounted] = useState(false);
  const [wordIdx, setWordIdx] = useState(0);
  const [chars, setChars] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    // Respect reduced motion: show first word fully, don't animate.
    if (typeof window !== 'undefined') {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mq.matches) {
        setChars(TYPE_WORDS[0].length);
        return;
      }
    }
    const current = TYPE_WORDS[wordIdx];
    const atEnd = chars === current.length;
    const atStart = chars === 0;
    let delay = deleting ? 55 : 95;
    if (!deleting && atEnd) delay = 1200;
    if (deleting && atStart) delay = 250;
    const t = setTimeout(() => {
      if (!deleting && atEnd) {
        setDeleting(true);
      } else if (deleting && atStart) {
        setDeleting(false);
        setWordIdx((i) => (i + 1) % TYPE_WORDS.length);
      } else {
        setChars((c) => c + (deleting ? -1 : 1));
      }
    }, delay);
    return () => clearTimeout(t);
  }, [mounted, chars, deleting, wordIdx]);

  const word = TYPE_WORDS[wordIdx].slice(0, chars);
  return (
    <span>
      <span style={{ color: BRAND.green }}>{word}</span>
      <span className="animate-caret" style={{ color: BRAND.green }}>
        |
      </span>
    </span>
  );
}

/* ---------- Countdown ---------- */
function Countdown({ target }: { target: number }) {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!mounted) {
    return <span className="tabular-nums">-- d -- h -- m</span>;
  }
  const diff = Math.max(0, target - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff / 3600000) % 24);
  const m = Math.floor((diff / 60000) % 60);
  const s = Math.floor((diff / 1000) % 60);
  return (
    <span className="tabular-nums">
      {d}d {h}h {m}m {s}s
    </span>
  );
}

/* ---------- Animated Counter ---------- */
function Counter({
  target,
  label,
  color,
}: {
  target: number;
  label: string;
  color: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [value, setValue] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const run = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      if (reduceMotion) {
        setValue(target);
        return;
      }
      const duration = 1800;
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / duration);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            run();
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.4 },
    );
    io.observe(node);
    // Safety net for screenshot/print contexts that don't fire IO
    const fallback = setTimeout(run, 2500);
    return () => {
      io.disconnect();
      clearTimeout(fallback);
    };
  }, [target]);

  return (
    <div ref={ref} className="text-center">
      <div
        className="font-[var(--font-heading)] text-5xl md:text-7xl tabular-nums"
        style={{ color }}
      >
        {value.toLocaleString()}
      </div>
      <div className="mt-2 text-base md:text-lg font-semibold" style={{ color: BRAND.ink }}>
        {label}
      </div>
    </div>
  );
}

/* ---------- Stagger wrapper (adds .is-visible when in view) ---------- */
function StaggerList({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reveal = () => node.classList.add('is-visible');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            reveal();
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15 },
    );
    io.observe(node);
    // Safety net: if IO hasn't fired in 2.5s (e.g. non-scrolling capture tools
    // or rare browser quirks), force-reveal so content is never invisible.
    const fallback = setTimeout(reveal, 2500);
    return () => {
      io.disconnect();
      clearTimeout(fallback);
    };
  }, []);
  return (
    <ul ref={ref} className={`stagger-parent ${className}`}>
      {children}
    </ul>
  );
}

/* ---------- Page ---------- */
export default function DemoV2Page() {
  return (
    <div style={{ backgroundColor: BRAND.cream, color: BRAND.ink }} className="min-h-screen">
      {/* NAV */}
      <nav
        aria-label="Primary"
        className="sticky top-0 z-50 flex items-center justify-between px-5 md:px-10 py-3 border-b-2 backdrop-blur"
        style={{ backgroundColor: `${BRAND.cream}E6`, borderColor: '#0B102015' }}
      >
        <Link
          href="/demo-v2"
          className="flex items-center gap-3 min-h-[48px]"
          aria-label="3D Ninjaz home"
        >
          <Logo size={44} />
          <span
            className="text-xl tracking-wide font-[var(--font-heading)]"
            style={{ color: BRAND.ink }}
          >
            3D <span style={{ color: BRAND.green }}>NINJAZ</span>
          </span>
        </Link>

        <div className="hidden md:flex gap-6 text-sm font-semibold">
          <a
            href="#shop"
            className="inline-flex items-center min-h-[48px] px-3 hover:opacity-70"
          >
            Shop
          </a>
          <a
            href="#how"
            className="inline-flex items-center min-h-[48px] px-3 hover:opacity-70"
          >
            How it works
          </a>
          <a
            href="#faq"
            className="inline-flex items-center min-h-[48px] px-3 hover:opacity-70"
          >
            FAQ
          </a>
        </div>

        <Link
          href="/sign-in"
          className="inline-flex items-center justify-center rounded-full px-6 text-white font-semibold text-sm shadow-md hover:opacity-90 transition min-h-[48px]"
          style={{ backgroundColor: BRAND.purple }}
        >
          Sign in
        </Link>
      </nav>

      {/* HERO */}
      <section
        aria-label="Hero"
        className="relative overflow-hidden pt-14 md:pt-20 pb-0"
        style={{ backgroundColor: BRAND.ink }}
      >
        <Shuriken
          className="absolute top-10 left-6 w-10 h-10 opacity-80 animate-spin-slow"
          fill={BRAND.blue}
        />
        <Shuriken
          className="absolute top-28 right-12 w-14 h-14 opacity-70 animate-spin-slow"
          fill={BRAND.green}
        />
        <Shuriken
          className="absolute bottom-44 left-20 w-8 h-8 opacity-90 animate-spin-slow"
          fill={BRAND.purple}
        />
        <Shuriken
          className="absolute bottom-52 right-8 w-12 h-12 opacity-60 animate-spin-slow"
          fill={BRAND.blue}
        />

        <div className="max-w-6xl mx-auto px-6 text-center relative z-10">
          <p
            className="inline-block rounded-full px-4 py-1 text-xs md:text-sm font-bold tracking-[0.2em] mb-8"
            style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
          >
            MADE IN MALAYSIA · 3D PRINTED
          </p>

          <div className="flex justify-center mb-6">
            <Image
              src="/logo.png"
              alt="3D Ninjaz — three chibi ninjas with a 3D printer"
              width={440}
              height={440}
              priority
              className="drop-shadow-2xl rounded-[28px]"
              style={{
                width: 'min(440px, 72vw)',
                height: 'auto',
                objectFit: 'contain',
              }}
            />
          </div>

          <h1
            className="font-[var(--font-heading)] tracking-tight text-4xl sm:text-5xl md:text-7xl leading-[1.05]"
            style={{ color: BRAND.cream }}
          >
            3D prints that are
            <br />
            <Typewriter />
          </h1>

          <p className="mt-6 max-w-xl mx-auto text-base md:text-lg font-medium text-white/75">
            Pick your piece. Choose your size. Three ninjas. One print job.
          </p>

          {/* Count strip */}
          <div
            className="mt-8 mx-auto flex flex-wrap justify-center items-center gap-3 md:gap-4 rounded-full px-5 py-3 border"
            style={{
              borderColor: 'rgba(255,255,255,0.15)',
              backgroundColor: 'rgba(255,255,255,0.05)',
              maxWidth: 560,
            }}
            aria-label="Quick stats"
          >
            <span className="font-[var(--font-heading)] text-lg md:text-2xl" style={{ color: BRAND.green }}>
              500
            </span>
            <span className="text-white/80 text-sm md:text-base">Prints</span>
            <Shuriken className="w-3 h-3" fill={BRAND.blue} />
            <span className="font-[var(--font-heading)] text-lg md:text-2xl" style={{ color: BRAND.blue }}>
              3
            </span>
            <span className="text-white/80 text-sm md:text-base">Ninjaz</span>
            <Shuriken className="w-3 h-3" fill={BRAND.purple} />
            <span className="font-[var(--font-heading)] text-lg md:text-2xl" style={{ color: BRAND.purple }}>
              1
            </span>
            <span className="text-white/80 text-sm md:text-base">Mission</span>
          </div>

          <div className="mt-10 mb-16 flex flex-wrap gap-4 justify-center">
            <a
              href="#shop"
              className="inline-flex items-center justify-center rounded-full px-8 font-bold text-lg shadow-[0_6px_0_rgba(0,0,0,0.35)] hover:translate-y-[2px] hover:shadow-[0_4px_0_rgba(0,0,0,0.35)] transition min-h-[60px]"
              style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
            >
              Shop the drop
            </a>
            <a
              href="#how"
              className="inline-flex items-center justify-center rounded-full px-8 font-bold text-lg border-2 hover:bg-white/10 transition min-h-[60px]"
              style={{ borderColor: BRAND.blue, color: BRAND.blue }}
            >
              How it works
            </a>
          </div>
        </div>

        <div className="-mt-2">
          <Wave color={BRAND.green} />
        </div>
      </section>

      {/* PROMO MARQUEE */}
      <section
        aria-label="Announcements"
        className="overflow-hidden py-4"
        style={{ backgroundColor: BRAND.green }}
      >
        <div className="relative w-full overflow-hidden">
          <div className="animate-marquee flex whitespace-nowrap will-change-transform">
            {Array.from({ length: 2 }).map((_, dup) => (
              <div key={dup} className="flex items-center shrink-0">
                {[
                  'Free shipping over RM 100',
                  'Ninja-fast KL delivery',
                  'New drops weekly',
                  'Parent approved',
                ].map((msg, i) => (
                  <span
                    key={`${dup}-${i}`}
                    className="flex items-center font-[var(--font-heading)] text-lg md:text-2xl px-6"
                    style={{ color: BRAND.ink }}
                  >
                    {msg}
                    <Shuriken
                      className="w-6 h-6 mx-6 animate-spin-slow"
                      fill={BRAND.ink}
                    />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BENTO — MEET THE 3 NINJAZ */}
      <section
        aria-label="Meet the 3 Ninjaz"
        className="py-20 md:py-28"
        style={{ backgroundColor: BRAND.cream }}
      >
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-center gap-4 mb-12">
            <Shuriken className="w-8 h-8 animate-spin-slow" fill={BRAND.blue} />
            <h2
              className="font-[var(--font-heading)] text-4xl md:text-6xl tracking-tight text-center"
              style={{ color: BRAND.ink }}
            >
              MEET THE <span style={{ color: BRAND.green }}>3 NINJAZ</span>
            </h2>
            <Shuriken className="w-8 h-8 animate-spin-slow" fill={BRAND.purple} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 md:grid-rows-2 gap-6 md:gap-8">
            {/* Big card — Jinbei */}
            <article
              className="md:col-span-2 md:row-span-2 rounded-[32px] p-8 md:p-12 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[340px]"
              style={{ backgroundColor: BRAND.blue, color: BRAND.cream }}
            >
              <Shuriken
                className="absolute -right-10 -bottom-10 w-64 h-64 opacity-20 animate-spin-slow"
                fill="#ffffff"
              />
              <div className="relative z-10">
                <p className="uppercase tracking-[0.2em] text-xs font-bold opacity-80">
                  The Blue
                </p>
                <h3 className="font-[var(--font-heading)] text-4xl md:text-6xl mt-2">
                  Jinbei
                </h3>
                <p className="mt-4 text-lg md:text-xl max-w-md text-white/90">
                  Master of Keychains. Cool-headed, quick on the loop.
                </p>
              </div>
              <a
                href="#cat-keychains"
                className="relative z-10 mt-8 inline-flex items-center gap-3 rounded-full px-6 font-bold self-start min-h-[56px]"
                style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
              >
                Shop keychains
                <ArrowIcon className="w-5 h-5" stroke={BRAND.ink} />
              </a>
            </article>

            {/* Top-right — Midori */}
            <article
              className="rounded-[32px] p-6 md:p-8 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[220px]"
              style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
            >
              <Shuriken
                className="absolute -right-6 -top-6 w-32 h-32 opacity-25 animate-spin-slow"
                fill={BRAND.ink}
              />
              <div className="relative z-10">
                <p className="uppercase tracking-[0.2em] text-xs font-bold opacity-70">
                  The Green
                </p>
                <h3 className="font-[var(--font-heading)] text-3xl md:text-4xl mt-1">
                  Midori
                </h3>
                <p className="mt-2 font-semibold">Queen of Planters.</p>
              </div>
              <a
                href="#cat-planters"
                className="relative z-10 mt-6 inline-flex items-center gap-2 rounded-full px-5 font-bold self-start min-h-[48px]"
                style={{ backgroundColor: BRAND.ink, color: BRAND.cream }}
              >
                Shop planters <ArrowIcon className="w-4 h-4" />
              </a>
            </article>

            {/* Bottom-right — Murasaki */}
            <article
              className="rounded-[32px] p-6 md:p-8 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[220px]"
              style={{ backgroundColor: BRAND.purple, color: BRAND.cream }}
            >
              <Shuriken
                className="absolute -left-6 -bottom-8 w-32 h-32 opacity-25 animate-spin-slow"
                fill="#ffffff"
              />
              <div className="relative z-10">
                <p className="uppercase tracking-[0.2em] text-xs font-bold opacity-80">
                  The Purple
                </p>
                <h3 className="font-[var(--font-heading)] text-3xl md:text-4xl mt-1">
                  Murasaki
                </h3>
                <p className="mt-2 font-semibold text-white/90">Desk Toy Legend.</p>
              </div>
              <a
                href="#cat-toys"
                className="relative z-10 mt-6 inline-flex items-center gap-2 rounded-full px-5 font-bold self-start min-h-[48px]"
                style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
              >
                Shop toys <ArrowIcon className="w-4 h-4" stroke={BRAND.ink} />
              </a>
            </article>
          </div>
        </div>
      </section>

      {/* SHOP BY SQUAD */}
      <section
        id="shop"
        aria-label="Shop by squad"
        className="py-20 md:py-28"
        style={{ backgroundColor: BRAND.cream }}
      >
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center justify-center gap-4 mb-14">
            <Shuriken className="w-8 h-8" fill={BRAND.blue} />
            <h2
              className="font-[var(--font-heading)] text-4xl md:text-6xl tracking-tight text-center"
              style={{ color: BRAND.ink }}
            >
              SHOP BY <span style={{ color: BRAND.purple }}>SQUAD</span>
            </h2>
            <Shuriken className="w-8 h-8" fill={BRAND.green} />
          </div>

          <StaggerList className="flex flex-col gap-6 items-center">
            {CATEGORIES.map((c, i) => (
              <li
                key={c.label}
                className="stagger-item w-full md:w-[min(760px,90%)]"
                style={{ transform: `rotate(${i % 2 === 0 ? -1.2 : 1.4}deg)` }}
              >
                <a
                  href={c.href}
                  className="flex items-center justify-center rounded-full px-10 text-center font-[var(--font-heading)] text-2xl md:text-4xl text-white shadow-[0_8px_0_rgba(11,16,32,0.2)] hover:translate-y-[3px] hover:shadow-[0_5px_0_rgba(11,16,32,0.2)] transition"
                  style={{ backgroundColor: c.bg, minHeight: 72 }}
                >
                  <span className="underline underline-offset-[10px] decoration-[6px] decoration-white/80">
                    {c.label}
                  </span>
                </a>
              </li>
            ))}
          </StaggerList>
        </div>
      </section>

      {/* FEATURED DROPS */}
      <section aria-label="Featured drops" className="relative">
        <Wave color={BRAND.blue} />
        <div className="py-20 md:py-28" style={{ backgroundColor: BRAND.blue }}>
          <div className="max-w-6xl mx-auto px-6">
            <h2
              className="font-[var(--font-heading)] text-4xl md:text-6xl text-center mb-4"
              style={{ color: BRAND.cream }}
            >
              FEATURED DROPS
            </h2>
            <p className="text-center mb-14 text-lg text-white/85">
              Fresh off the printer. Limited runs, ninja fast delivery.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {FEATURED.map((p, i) => (
                <article
                  key={p.name}
                  className="rounded-[32px] p-6 shadow-xl hover:-translate-y-2 transition-transform flex flex-col"
                  style={{
                    backgroundColor: BRAND.cream,
                    transform: `rotate(${[-1.5, 0, 1.5][i]}deg)`,
                  }}
                >
                  <div
                    className="aspect-square rounded-[24px] flex items-center justify-center relative overflow-hidden"
                    style={{ backgroundColor: `${p.accent}20` }}
                  >
                    <Shuriken className="w-24 h-24 animate-spin-slow" fill={p.accent} />
                    <span
                      className="absolute top-4 right-4 rounded-full px-3 py-1 text-xs font-bold text-white"
                      style={{ backgroundColor: p.accent }}
                    >
                      {p.badge}
                    </span>
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <h3
                      className="font-[var(--font-heading)] text-xl"
                      style={{ color: BRAND.ink }}
                    >
                      {p.name}
                    </h3>
                    <span
                      className="rounded-full px-4 py-1 font-bold text-white text-sm whitespace-nowrap"
                      style={{ backgroundColor: p.accent }}
                    >
                      {p.price}
                    </span>
                  </div>
                  {p.countdown && (
                    <p
                      className="mt-3 rounded-full px-4 py-2 text-sm font-semibold text-center"
                      style={{ backgroundColor: '#0B102010', color: BRAND.ink }}
                      aria-live="polite"
                    >
                      Drop ends in <Countdown target={DROP_END} />
                    </p>
                  )}
                  <button
                    className="mt-4 w-full rounded-full font-bold text-white hover:opacity-90 transition"
                    style={{ backgroundColor: BRAND.ink, minHeight: 56 }}
                  >
                    Add to cart
                  </button>
                </article>
              ))}
            </div>
          </div>
        </div>
        <Wave color={BRAND.blue} flip />
      </section>

      {/* HOW IT WORKS */}
      <section
        id="how"
        aria-label="How it works"
        className="py-20 md:py-28"
        style={{ backgroundColor: BRAND.cream }}
      >
        <div className="max-w-5xl mx-auto px-6">
          <h2
            className="font-[var(--font-heading)] text-4xl md:text-6xl text-center mb-14"
            style={{ color: BRAND.ink }}
          >
            3 STEPS. <span style={{ color: BRAND.green }}>NO JUTSU REQUIRED.</span>
          </h2>
          <ol className="grid md:grid-cols-3 gap-8">
            {[
              {
                n: '01',
                t: 'Pick your ninja',
                d: 'Browse drops. Tap the one that speaks to you.',
                c: BRAND.blue,
              },
              {
                n: '02',
                t: 'Size up (S/M/L)',
                d: 'Small, medium, or large — ninjas come in every size.',
                c: BRAND.green,
              },
              {
                n: '03',
                t: 'Checkout + ship',
                d: 'PayPal pays it. We print it. Your doorstep catches it.',
                c: BRAND.purple,
              },
            ].map((s) => (
              <li
                key={s.n}
                className="rounded-[28px] p-8 shadow-lg border-b-[6px] bg-white flex flex-col"
                style={{ borderColor: s.c }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="font-[var(--font-heading)] text-6xl"
                    style={{ color: s.c }}
                  >
                    {s.n}
                  </span>
                  <Shuriken className="w-10 h-10 animate-spin-slow" fill={s.c} />
                </div>
                <h3 className="text-2xl font-bold mb-2" style={{ color: BRAND.ink }}>
                  {s.t}
                </h3>
                <p className="text-slate-700">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* STATS STRIP */}
      <section
        aria-label="By the numbers"
        className="py-20 md:py-24"
        style={{ backgroundColor: BRAND.cream, borderTop: '2px dashed #0B102020' }}
      >
        <div className="max-w-5xl mx-auto px-6">
          <h2
            className="font-[var(--font-heading)] text-3xl md:text-5xl text-center mb-12"
            style={{ color: BRAND.ink }}
          >
            BY THE NUMBERS
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <Counter target={1247} label="Happy ninjas" color={BRAND.blue} />
            <Counter target={5893} label="Prints shipped" color={BRAND.green} />
            <Counter target={38} label="Cities reached" color={BRAND.purple} />
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section
        aria-label="Loved by"
        className="py-14"
        style={{ backgroundColor: '#0B102008' }}
      >
        <div className="max-w-6xl mx-auto px-6">
          <p
            className="text-center text-sm tracking-[0.25em] uppercase font-bold mb-6"
            style={{ color: BRAND.ink }}
          >
            Loved by
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
            {TRUST_BADGES.map((b, i) => (
              <li key={b}>
                <span
                  className="inline-flex items-center rounded-full border-2 px-5 py-2 font-[var(--font-heading)] text-sm md:text-base"
                  style={{
                    borderColor: [BRAND.blue, BRAND.green, BRAND.purple][i % 3],
                    color: BRAND.ink,
                    backgroundColor: 'white',
                    minHeight: 44,
                  }}
                >
                  {b}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA STRIP */}
      <section aria-label="Create account" className="relative">
        <Wave color={BRAND.purple} />
        <div className="py-20 text-center" style={{ backgroundColor: BRAND.purple }}>
          <div className="flex justify-center mb-6">
            <Logo size={80} />
          </div>
          <h2
            className="font-[var(--font-heading)] text-4xl md:text-6xl mb-8"
            style={{ color: 'white', textShadow: `4px 4px 0 ${BRAND.ink}40` }}
          >
            READY TO STRIKE?
          </h2>
          <Link
            href="/sign-up"
            className="inline-flex items-center justify-center rounded-full px-10 font-bold text-lg shadow-[0_6px_0_rgba(0,0,0,0.3)] hover:translate-y-[2px] hover:shadow-[0_4px_0_rgba(0,0,0,0.3)] transition min-h-[60px]"
            style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
          >
            Create your account
          </Link>
          <p className="mt-4 text-sm text-white/80">
            Whoops! Not a member yet? It takes 30 seconds.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer
        id="faq"
        className="py-12 px-6"
        style={{ backgroundColor: BRAND.ink, color: BRAND.cream }}
      >
        <div className="max-w-6xl mx-auto flex flex-col gap-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Logo size={44} />
              <span className="font-[var(--font-heading)] tracking-wide text-xl">
                3D <span style={{ color: BRAND.green }}>NINJAZ</span>
              </span>
            </div>
            <nav aria-label="Social" className="flex gap-2 md:gap-3 flex-wrap justify-center">
              {['Instagram', 'TikTok', 'hello@3dninjaz.com'].map((s) => (
                <a
                  key={s}
                  href={s.includes('@') ? `mailto:${s}` : '#'}
                  className="inline-flex items-center rounded-full px-4 border border-white/20 hover:bg-white/10 transition text-sm"
                  style={{ minHeight: 44 }}
                >
                  {s}
                </a>
              ))}
            </nav>
          </div>

          <p className="text-xs text-white/60 text-center max-w-2xl mx-auto leading-relaxed">
            We handle your data responsibly — read our{' '}
            <a href="#" className="underline underline-offset-2 hover:text-white">
              privacy notice
            </a>
            . PDPA 2010 compliant · Made with love in Kuala Lumpur, Malaysia.
          </p>

          <p className="text-sm text-white/50 text-center">
            © 2026 3D Ninjaz · Kuala Lumpur, MY
          </p>
        </div>
      </footer>
    </div>
  );
}
