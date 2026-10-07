import Link from "next/link";

const VARIANTS = [
  { href: "/xmas-preview/v1", name: "1. Night shift", note: "Subtle: audit fixes, canvas snow, one accent" },
  { href: "/xmas-preview/v2", name: "2. Print farm", note: "Balanced: floating printed baubles in the scene, how-it's-made strip" },
  { href: "/xmas-preview/v3", name: "3. Scroll to print", note: "Impressive: scrolling drives the print" },
];

export default function PreviewIndex() {
  return (
    <main style={{ minHeight: "100dvh", background: "#0a1f3d", color: "#f6fbff", padding: "3rem 1.5rem" }}>
      <h1 style={{ fontFamily: "var(--font-heading), sans-serif", fontSize: "2rem" }}>
        Christmas redesign previews
      </h1>
      <ul style={{ marginTop: "1.5rem", display: "grid", gap: "1rem", maxWidth: "36rem" }}>
        {VARIANTS.map((v) => (
          <li key={v.href}>
            <Link href={v.href} style={{ fontWeight: 700, textDecoration: "underline" }}>{v.name}</Link>
            <p style={{ opacity: 0.85 }}>{v.note}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
