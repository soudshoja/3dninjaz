import Image from "next/image";
import Link from "next/link";

const BRAND = {
  blue: "#066BD2",
  green: "#398E07",
  purple: "#5C27A7",
  ink: "#0B1020",
  cream: "#F7FAF4",
};

const categories = [
  { label: "Keychains", bg: BRAND.blue, href: "#cat-keychains" },
  { label: "Phone Stands", bg: BRAND.green, href: "#cat-stands" },
  { label: "Desk Toys", bg: BRAND.purple, href: "#cat-toys" },
  { label: "Planters", bg: BRAND.blue, href: "#cat-planters" },
  { label: "Custom Nameplates", bg: BRAND.green, href: "#cat-nameplates" },
  { label: "Cable Organizers", bg: BRAND.purple, href: "#cat-cables" },
];

const featured = [
  { name: "Shuriken Keychain", price: "RM 18", accent: BRAND.blue },
  { name: "Dragon Phone Stand", price: "RM 45", accent: BRAND.green },
  { name: "Ninja Planter Pot", price: "RM 32", accent: BRAND.purple },
];

function Shuriken({ className = "", fill = BRAND.blue }: { className?: string; fill?: string }) {
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
      className={`block w-full h-[60px] md:h-[100px] ${flip ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path
        d="M0,64 C240,112 480,16 720,48 C960,80 1200,128 1440,64 L1440,120 L0,120 Z"
        fill={color}
      />
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
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}

export default function DemoPage() {
  return (
    <div style={{ backgroundColor: BRAND.cream, color: BRAND.ink }} className="min-h-screen">
      {/* NAV */}
      <nav
        className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-12 py-3 border-b-2 backdrop-blur"
        style={{ backgroundColor: `${BRAND.cream}E6`, borderColor: "#0B102010" }}
      >
        <Link href="/demo" className="flex items-center gap-3">
          <Logo size={44} />
          <span
            className="text-xl tracking-wide font-[var(--font-heading)]"
            style={{ color: BRAND.ink }}
          >
            3D <span style={{ color: BRAND.green }}>NINJAZ</span>
          </span>
        </Link>
        <div className="hidden md:flex gap-8 text-sm font-semibold">
          <a href="#shop" className="hover:opacity-70">Shop</a>
          <a href="#how" className="hover:opacity-70">How it works</a>
          <a href="#faq" className="hover:opacity-70">FAQ</a>
        </div>
        <Link
          href="/sign-in"
          className="rounded-full px-5 py-2 text-white font-semibold text-sm shadow-md hover:opacity-90 transition"
          style={{ backgroundColor: BRAND.purple }}
        >
          Sign in
        </Link>
      </nav>

      {/* HERO */}
      <section
        className="relative overflow-hidden pt-14 md:pt-20 pb-0"
        style={{ backgroundColor: BRAND.ink }}
      >
        <Shuriken className="absolute top-10 left-8 w-10 h-10 opacity-80 animate-spin-slow" fill={BRAND.blue} />
        <Shuriken className="absolute top-24 right-16 w-14 h-14 opacity-70 animate-spin-slow" fill={BRAND.green} />
        <Shuriken className="absolute bottom-40 left-24 w-8 h-8 opacity-90 animate-spin-slow" fill={BRAND.purple} />
        <Shuriken className="absolute bottom-48 right-10 w-12 h-12 opacity-60 animate-spin-slow" fill={BRAND.blue} />

        <div className="max-w-6xl mx-auto px-6 text-center">
          <p
            className="inline-block rounded-full px-4 py-1 text-xs md:text-sm font-bold tracking-[0.2em] mb-8"
            style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
          >
            MADE IN MALAYSIA · 3D PRINTED
          </p>

          <div className="flex justify-center mb-6">
            <Image
              src="/logo.png"
              alt="3D Ninjaz logo"
              width={520}
              height={520}
              priority
              className="drop-shadow-2xl rounded-[28px]"
              style={{ width: "min(520px, 80vw)", height: "auto", objectFit: "contain" }}
            />
          </div>

          <h1
            className="font-[var(--font-heading)] tracking-tight text-4xl sm:text-5xl md:text-6xl leading-tight"
            style={{ color: BRAND.cream }}
          >
            Stealthy 3D prints.
            <br />
            <span style={{ color: BRAND.green }}>Shipped across Malaysia.</span>
          </h1>

          <p className="mt-6 max-w-xl mx-auto text-base md:text-lg font-medium text-white/70">
            Pick your piece. Choose your size. Three ninjas. One print job.
          </p>

          <div className="mt-10 mb-16 flex flex-wrap gap-4 justify-center">
            <a
              href="#shop"
              className="rounded-full px-8 py-4 font-bold text-lg shadow-[0_6px_0_rgba(0,0,0,0.35)] hover:translate-y-[2px] hover:shadow-[0_4px_0_rgba(0,0,0,0.35)] transition"
              style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
            >
              Shop the drop
            </a>
            <a
              href="#how"
              className="rounded-full px-8 py-4 font-bold text-lg border-2 hover:bg-white/10 transition"
              style={{ borderColor: BRAND.blue, color: BRAND.blue }}
            >
              How it works
            </a>
          </div>
        </div>

        <div className="-mt-2">
          <Wave color={BRAND.cream} />
        </div>
      </section>

      {/* CATEGORIES */}
      <section id="shop" className="py-20 md:py-28" style={{ backgroundColor: BRAND.cream }}>
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
          <ul className="flex flex-col gap-6 items-center">
            {categories.map((c, i) => (
              <li
                key={c.label}
                className="w-full md:w-[min(760px,90%)]"
                style={{ transform: `rotate(${i % 2 === 0 ? -1.2 : 1.4}deg)` }}
              >
                <a
                  href={c.href}
                  className="block rounded-full px-10 py-6 md:py-8 text-center font-[var(--font-heading)] text-3xl md:text-5xl text-white shadow-[0_8px_0_rgba(11,16,32,0.2)] hover:translate-y-[3px] hover:shadow-[0_5px_0_rgba(11,16,32,0.2)] transition"
                  style={{ backgroundColor: c.bg }}
                >
                  <span className="underline underline-offset-[10px] decoration-[6px] decoration-white/80">
                    {c.label}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FEATURED */}
      <section className="relative">
        <Wave color={BRAND.blue} />
        <div className="py-20 md:py-28" style={{ backgroundColor: BRAND.blue }}>
          <div className="max-w-6xl mx-auto px-6">
            <h2
              className="font-[var(--font-heading)] text-4xl md:text-6xl text-center mb-4"
              style={{ color: BRAND.cream }}
            >
              FEATURED DROPS
            </h2>
            <p className="text-center mb-14 text-lg text-white/80">
              Fresh off the printer. Limited runs, ninja fast delivery.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {featured.map((p, i) => (
                <article
                  key={p.name}
                  className="rounded-[32px] p-6 shadow-xl hover:-translate-y-2 transition-transform"
                  style={{ backgroundColor: BRAND.cream, transform: `rotate(${[-1.5, 0, 1.5][i]}deg)` }}
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
                      NEW
                    </span>
                  </div>
                  <div className="mt-5 flex items-center justify-between">
                    <h3 className="font-[var(--font-heading)] text-xl" style={{ color: BRAND.ink }}>
                      {p.name}
                    </h3>
                    <span
                      className="rounded-full px-4 py-1 font-bold text-white text-sm"
                      style={{ backgroundColor: p.accent }}
                    >
                      {p.price}
                    </span>
                  </div>
                  <button
                    className="mt-4 w-full rounded-full py-3 font-bold text-white hover:opacity-90 transition"
                    style={{ backgroundColor: BRAND.ink }}
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
      <section id="how" className="py-20 md:py-28" style={{ backgroundColor: BRAND.cream }}>
        <div className="max-w-5xl mx-auto px-6">
          <h2
            className="font-[var(--font-heading)] text-4xl md:text-6xl text-center mb-14"
            style={{ color: BRAND.ink }}
          >
            3 STEPS. <span style={{ color: BRAND.green }}>NO JUTSU REQUIRED.</span>
          </h2>
          <ol className="grid md:grid-cols-3 gap-8">
            {[
              { n: "01", t: "Browse", d: "Scroll the drops. Pick a piece.", c: BRAND.blue },
              { n: "02", t: "Size up", d: "Small, medium, or large ninja.", c: BRAND.green },
              { n: "03", t: "Checkout", d: "PayPal. Shipped across Malaysia.", c: BRAND.purple },
            ].map((s) => (
              <li
                key={s.n}
                className="rounded-[28px] p-8 shadow-lg border-b-[6px]"
                style={{ backgroundColor: "white", borderColor: s.c }}
              >
                <div className="font-[var(--font-heading)] text-6xl mb-3" style={{ color: s.c }}>
                  {s.n}
                </div>
                <h3 className="text-2xl font-bold mb-2">{s.t}</h3>
                <p className="text-slate-600">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA STRIP */}
      <section className="relative">
        <Wave color={BRAND.purple} />
        <div className="py-20 text-center" style={{ backgroundColor: BRAND.purple }}>
          <div className="flex justify-center mb-6">
            <Logo size={80} />
          </div>
          <h2
            className="font-[var(--font-heading)] text-4xl md:text-6xl mb-6"
            style={{ color: "white", textShadow: `4px 4px 0 ${BRAND.ink}40` }}
          >
            READY TO STRIKE?
          </h2>
          <Link
            href="/sign-up"
            className="inline-block rounded-full px-10 py-5 font-bold text-lg shadow-[0_6px_0_rgba(0,0,0,0.3)] hover:translate-y-[2px] hover:shadow-[0_4px_0_rgba(0,0,0,0.3)] transition"
            style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
          >
            Create your account
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-10 px-6" style={{ backgroundColor: BRAND.ink, color: BRAND.cream }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <span className="font-[var(--font-heading)] tracking-wide">3D NINJAZ</span>
          </div>
          <p className="text-sm text-white/60">© 2026 3D Ninjaz · Kuala Lumpur, MY</p>
          <div className="flex gap-5 text-sm">
            <a href="#" className="hover:text-white">Instagram</a>
            <a href="#" className="hover:text-white">TikTok</a>
            <a href="mailto:hello@3dninjaz.com" className="hover:text-white">hello@3dninjaz.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
