import Image from "next/image";

/**
 * Brand logo wrapper. Wraps next/image around /logo.png with a
 * consistent contain + rounded treatment. `priority` lifts LCP on
 * hero surfaces that render the logo above the fold.
 */
export function Logo({
  size = 44,
  priority = false,
}: {
  size?: number;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt="3D Ninjaz"
      width={size}
      height={size}
      priority={priority}
      className="rounded-xl"
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
