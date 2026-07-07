/**
 * Phase 21 (21-07) — JSX declaration for the `<model-viewer>` custom element.
 *
 * `@google/model-viewer` registers a native web component at runtime (via
 * the client-only import in admin-meshy-model-viewer.tsx); it ships its own
 * `HTMLElementTagNameMap` augmentation (dist/model-viewer.d.ts) for plain DOM
 * APIs, but React 19's JSX typing needs its own `IntrinsicElements` entry or
 * `tsc` fails with "Property 'model-viewer' does not exist on type 'JSX....'".
 *
 * No precedent for this in the repo (21-PATTERNS §9f) — this is new ground.
 */
import type * as React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string;
        alt?: string;
        "camera-controls"?: boolean | "";
        "auto-rotate"?: boolean | "";
        "shadow-intensity"?: string;
        exposure?: string;
        style?: React.CSSProperties;
      };
    }
  }
}
