"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Renders its children on the home page ("/") only. Lets the shared store
 *  layout show something above the nav without it appearing on every page. */
export function HomeOnly({ children }: { children: ReactNode }) {
  return usePathname() === "/" ? <>{children}</> : null;
}
