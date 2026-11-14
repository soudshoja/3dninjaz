/**
 * IG WebView hardening (Task 17, Finding B1) — the mobile sticky "Add to
 * Bag"/"Personalise" CTA used to render `disabled={!canAdd}` with no
 * fallback handler, so on a fresh product landing (form empty) the button
 * was completely inert. This helper gives it something to do: scroll (and
 * focus) the first unfilled/invalid field inside the personalise/form card.
 *
 * Plain lib, no React — shared by configurable-product-view.tsx and
 * simple-product-view.tsx (both PDP view paths).
 */

const FOCUS_DELAY_MS = 350;

export function scrollToFirstEmpty(root: HTMLElement | null): void {
  if (typeof window === "undefined" || !root) return;

  const target: Element =
    root.querySelector('[aria-invalid="true"]') ??
    root.querySelector("input:not([type=hidden]), select, textarea") ??
    root;

  target.scrollIntoView({ behavior: "smooth", block: "center" });

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  ) {
    // Delay the focus until the smooth scroll has mostly settled — matches
    // the timing the checkout dock's jumpToIncomplete already uses, so
    // iOS doesn't fight the scroll animation by yanking the viewport to the
    // newly-focused input mid-scroll.
    window.setTimeout(() => {
      target.focus({ preventScroll: true });
    }, FOCUS_DELAY_MS);
  }
}
