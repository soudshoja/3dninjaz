import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Route-level metadata for /bag.
 *
 * The page itself is a client component (Zustand hydration), so metadata
 * has to live on a server layout. Bag content is per-user + ephemeral and
 * must never be indexed — noindex keeps it out of search results and out
 * of link-preview scrapers that might cache stale cart state.
 */
export const metadata: Metadata = {
  title: "Your bag",
  description: "Review the items in your 3D Ninjaz bag before checkout.",
  robots: { index: false, follow: false },
};

export default function BagLayout({ children }: { children: ReactNode }) {
  return children;
}
