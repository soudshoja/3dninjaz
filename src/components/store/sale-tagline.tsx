"use client";

import { useEffect, useState } from "react";
import { BLACK_FRIDAY, isBlackFridayOn } from "@/lib/black-friday";

/**
 * Hero pill text. Shows the sale line while Black Friday is on and the usual
 * tagline otherwise. `saleOn` is decided on the server at render; the effect
 * only corrects a cached page that outlived the sale.
 */
export function SaleTagline({ saleOn, children }: { saleOn: boolean; children: string }) {
  const [on, setOn] = useState(saleOn);
  useEffect(() => {
    if (!isBlackFridayOn()) setOn(false);
  }, []);
  if (!on) return <>{children}</>;
  return (
    <>
      Black Friday: 15% off everything
      <span className="hidden sm:inline">, {BLACK_FRIDAY.when}</span>
    </>
  );
}
