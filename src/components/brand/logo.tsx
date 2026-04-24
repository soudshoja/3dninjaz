import Image from "next/image";

/**
 * Brand logo wrapper. Wraps next/image around /logo.png with a
 * consistent contain + rounded treatment. `priority` lifts LCP on
 * hero surfaces that render the logo above the fold.
 */
export function Logo({
  size = 44,
  priority = false,
  className,
}: {
  size?: number;
  priority?: boolean;
  /** Optional Tailwind classes to override width/height for responsive sizing */
  className?: string;
}) {
  return (
    <Image
      src="/logo.png"
      alt="3D Ninjaz"
      width={size}
      height={size}
      priority={priority}
      className={className ?? "rounded-xl"}
      style={
        className
          ? { objectFit: "contain" }
          : { width: size, height: size, objectFit: "contain" }
      }
    />
  );
}
