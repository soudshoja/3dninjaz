import { Sparkles } from "lucide-react";
import { BRAND } from "@/lib/brand";

/**
 * UI-only loyalty placeholder (06-CONTEXT Assumption 1, Q-06-01 resolution).
 * Reserves layout space so a future loyalty engine can drop in without
 * redesigning the /account profile page.
 */
export function LoyaltyCard() {
  return (
    <div
      className="rounded-2xl p-5 mb-4"
      style={{ backgroundColor: `${BRAND.purple}15` }}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <Sparkles
          className="h-6 w-6 shrink-0"
          style={{ color: BRAND.purple }}
          aria-hidden
        />
        <div>
          <p className="text-sm text-slate-600">Loyalty points</p>
          <p className="font-[var(--font-heading)] text-2xl">0</p>
        </div>
        <span
          className="ml-auto text-xs px-2 py-1 rounded-full font-bold uppercase tracking-wider"
          style={{
            backgroundColor: `${BRAND.purple}30`,
            color: BRAND.purple,
          }}
        >
          Coming soon
        </span>
      </div>
      <p className="text-sm text-slate-600 mt-3">
        Earn points on every order once we launch Ninjaz rewards.
      </p>
    </div>
  );
}
