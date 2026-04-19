/**
 * Full-width wave divider. Used between sections to carry the demo's
 * playful rhythm. `flip` rotates the wave so a section can close with
 * the mirror of its open wave.
 */
export function Wave({ color, flip = false }: { color: string; flip?: boolean }) {
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
