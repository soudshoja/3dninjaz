import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "3D Ninjaz — 3D Printed Products",
  description:
    "Browse and buy unique 3D printed products. Ninja crafted in Malaysia.",
};

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-24 text-center">
      <h1 className="font-heading text-5xl text-[var(--color-brand-text-primary)]">
        3D Ninjaz
      </h1>
      <p className="max-w-xl text-lg text-[var(--color-brand-text-muted)]">
        Coming Soon &mdash; Your 3D Printed Products Store
      </p>
      <p className="max-w-xl text-sm text-[var(--color-brand-text-muted)]">
        Unique figurines, phone cases, and home decor. All ninja crafted in
        Malaysia.
      </p>
    </div>
  );
}
