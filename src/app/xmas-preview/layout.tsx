import type { Metadata } from "next";
import type { ReactNode } from "react";

// Design previews for the /christmas redesign. Not linked from the store and
// kept out of search engines. Delete this folder once a direction is chosen.
export const metadata: Metadata = {
  title: "Christmas redesign previews",
  robots: { index: false, follow: false },
};

export default function PreviewLayout({ children }: { children: ReactNode }) {
  return children;
}
