---
task: skew-checkout-selfheal
mode: quick
date: 2026-09-11
branch: fix/stale-bundle-selfheal
base: dev
files_modified:
  - src/lib/is-stale-bundle-error.ts          # new
  - src/lib/is-stale-bundle-error.test.ts     # new
  - src/app/error.tsx
  - src/app/global-error.tsx
files_read_not_modified:
  - src/components/error/branded-500.tsx      # verified: NO change needed (see F-05)
autonomous: false   # Task 7 is a human verification checkpoint
---

# Self-healing error boundaries for stale-bundle / deployment-skew errors

## Objective

A customer on iOS 17.3.1 inside the Instagram in-app WebView hit
`Failed to find Server Action "62dd0a82…"` at `/checkout`, was shown the
branded 500 page, pressed "Try again" five times in 60 seconds, and bounced
without paying (RM70 lost; a second RM22 order stuck `pending` at 09:35).
427 occurrences of this error since June.

Root cause is already established and is **not** re-litigated here: the IG
WebView served a client bundle older than the running server build; server
action IDs are content-derived, so the checkout action's ID no longer existed
server-side. `reset()` re-renders the boundary against the *same stale bundle*,
so it can never recover — that is the observed loop.

**This change makes the two root error boundaries recognise that specific,
recoverable error class and self-heal with a single cache-busted hard
navigation, instead of dead-ending.**

Out of scope (explicit): `next.config.ts` cache headers, `deploymentId`,
any Next.js upgrade, any change to the checkout server actions.

---

## Findings from the repo (read before planning — do not re-derive)

**F-01 — The bag already survives a hard reload. No nested checkout boundary
is needed.**
`src/stores/cart-store.ts` uses `zustand/middleware` `persist` +
`createJSONStorage(() => localStorage)` under key `print-ninjaz-cart-v2`
(version 3). A full-document navigation rehydrates it. `CheckoutIsland`
(`src/components/checkout/paypal-provider.tsx`) already gates redirects on
post-hydration state, so the bag is intact after recovery.
The shipping address draft (`src/stores/checkout-draft-store.ts`) is also
localStorage-backed — but **keyed by `userId`, so guests lose typed address
fields on reload.** That is a pre-existing gap, it is *not* made worse by this
change, and a nearer boundary would not fix it either (see F-02).
→ **Recommendation: do NOT add `src/app/(store)/checkout/error.tsx`.** A nested
boundary only buys you a narrower `reset()`, and `reset()` is precisely the
thing that cannot work here — the stale bundle is a document-level fact. It
would add surface area and a second copy of the recovery logic for zero
recovery benefit. Ship the root-boundary fix today; log "persist guest address
draft to sessionStorage" as a separate follow-up.

**F-02 — Recovery for this error class must be a full document load.**
Any React-level retry (`reset()`, nested boundary, `router.refresh()`) reuses
the already-parsed stale JS. Only a new document fetch can pull the new
bundle — hence `window.location.replace()` with a cache-busting param rather
than `location.reload()` (which the IG WebView may satisfy from its own cache).

**F-03 — Double-charge risk: assessed, NOT a blocker. Reasoning below.**
The PayPal path cannot reach these boundaries mid-payment:
`src/components/checkout/paypal-button.tsx` calls `createPayPalOrder` inside
the SDK's `createOrder` callback and `capturePayPalOrder` inside `onApprove`.
Both `throw` on failure, but those throws are caught by the PayPal SDK and
routed to the component's own `onError={...}` handler, which calls
`setErrorMsg(...)`. They never propagate to a React error boundary. A stale
action ID on either call therefore renders the button's inline error, not the
500 page.
Additionally, a capture is only ever initiated by PayPal invoking `onApprove`
after buyer approval. An auto-reload of `/checkout` re-mounts the button in its
initial state; it does not replay `onApprove` and cannot re-trigger a capture.
The WhatsApp bank-transfer path *can* reach the boundary —
`whatsapp-bank-transfer-button.tsx` awaits `createWhatsAppOrder` inside
`startTransition(async () => …)` with no try/catch, and React 19 propagates an
uncaught transition rejection to the nearest boundary. That path takes **no
payment at all**, and its own code comment records that the server reuses the
same order for an identical retry (idempotent by design, added after the
2026-06-12 duplicate-order incident).
→ **Recommendation: do NOT add a "payment in flight" suppression flag.** It
would mean touching `paypal-button.tsx` to set/clear state that, per the above,
can never be observed by the boundary — pure risk with no coverage gained, on a
same-day production change.
→ **Reviewer call-out (please confirm, do not silently accept):** the only way
this conclusion breaks is if some future code path calls `capturePayPalOrder`
outside the SDK's `onApprove` callback. Grep confirms it has exactly one call
site today. If a reviewer disagrees with F-03, stop and escalate before merge.

**F-04 — `"load failed"` as a substring is a false-positive trap.**
`"Upload failed"` contains `"load failed"`. iOS Safari's actual message is
exactly `Load failed`; Chrome's is exactly `Failed to fetch`. The detector must
use **trimmed, case-insensitive whole-message equality** for those two, and
substring matching only for `Failed to find Server Action` (which has a
variable action id appended). This is why the detector is a separately tested
module.

**F-05 — `src/components/error/branded-500.tsx` needs NO change.**
It already renders the "Try again" button from an optional `reset?: () => void`
prop. `error.tsx` decides *which function* to pass. Wiring the second-attempt
hard reload is therefore a change in `error.tsx` only. Keeping this file
untouched keeps the diff to 2 new + 2 edited files.

**F-06 — Test + CI reality.**
`vitest@^4.1.5` is a devDependency, `vitest.config.mts` exists with
`environment: "node"` and the `@` alias, and `src/lib/*.test.ts` is the
established convention (`format.test.ts`, `config-hash.test.ts`, …).
There is **no `test` script in `package.json`** — run tests with
`npx vitest run <file>`. CI (`.github/workflows/deploy.yml`, job
"Install + typecheck") runs `npx tsc --noEmit` and lint only; it does **not**
run vitest. Do not add vitest to CI in this PR (scope).

**F-07 — Appending `_v` to any route is safe.**
No page in `src/app` parses `searchParams` with a strict/exhaustive Zod schema
(`grep '\.strict()' src/app src/lib` → no hits). `/checkout` is
`export const dynamic = "force-dynamic"`. An unknown `_v` param is inert.

---

## Design decisions

**D-01 — One module, four exports.** Detection and recovery live together in
`src/lib/is-stale-bundle-error.ts`. It is a plain lib (not `"use server"`), so
it may export types freely. Two exports are pure and directly unit-tested; the
sessionStorage guard is testable in the node environment by stubbing
`globalThis.sessionStorage`.

**D-02 — One automatic attempt per browsing session, tracked in
`sessionStorage` under `pn:stale-bundle-reload`.** Every access wrapped in
try/catch (Safari private mode throws on `sessionStorage` access). If the
storage read *throws*, treat it as "already attempted" → fail closed, render
the manual UI. Never auto-reload when we cannot prove we have not already.
*Rejected alternative:* a 60-second re-arm window (timestamp instead of a
boolean), which would allow a later, unrelated transient error in the same long
session to also self-heal. Rejected for today — the brief asks for at most one
per session and a boolean is the smaller, more legible risk.

**D-03 — Telemetry must land before we navigate away.**
`location.replace()` aborts in-flight requests, so firing `reportClientError`
and navigating in the same tick would silently drop the report for exactly the
errors we most want to count. The effect awaits the report (it already has
`.catch(() => {})`) and races it against a ~1000 ms timeout, then navigates.
Worst case the customer waits one extra second; best case we keep the 427-event
signal and can measure whether recovery worked. The report payload gains
`context.autoRecover: true | false` so the server log distinguishes
"auto-healed" from "user is stuck".

**D-04 — The security contract is unchanged.** `error.message` / `error.stack`
are read *only* inside the boundary's logic and passed *only* to
`reportClientError`. Nothing new is rendered into the tree.
`T-07-09-error-page-leak` holds. The `requestId` display stays.

**D-05 — No "Reloading…" interstitial.** The boundary will briefly paint the
normal 500 page before the navigation commits. Adding a `recovering` state
would require touching `branded-500.tsx` (F-05) for a sub-second flash.
Skipped deliberately; note it as a polish follow-up.

---

## Tasks

### Task 1 — Create the detector + recovery lib

**Files:** `src/lib/is-stale-bundle-error.ts` (new)

**Action:**
Create a plain (non-`"use server"`) module exporting exactly four things.

`isStaleBundleError(error: unknown): boolean`
- Guard for non-objects; read `message` and `name` defensively off `unknown`
  (`typeof x === "string"` checks, no casts that can throw).
- Normalise: `const msg = String(message ?? "").trim().toLowerCase()`, same for
  `name`.
- Return `true` when ANY of:
  1. `msg.includes("failed to find server action")` — substring, because the
     action id and the "older or newer deployment" tail are variable.
  2. `msg === "load failed"` — **exact equality** (iOS Safari fetch rejection).
     Per F-04, substring matching here would also catch `"Upload failed"`.
  3. `msg === "failed to fetch"` — **exact equality** (Chrome/Edge).
  4. `msg.startsWith("networkerror")` — Firefox's
     `NetworkError when attempting to fetch resource.`
  5. `name === "chunkloaderror"` OR `msg.includes("chunkloaderror")` OR
     `msg.startsWith("loading chunk")` OR `msg.startsWith("loading css chunk")`
     — the webpack/Next chunk-fetch failure, same stale-bundle root cause.
- Return `false` for everything else. No blanket catch, no `digest` sniffing.
- Document in a header comment *why* 2 and 3 are exact-match (F-04) so a future
  editor does not "simplify" them into `includes`.

`buildCacheBustedUrl(href: string, stamp: number): string`
- Parse with `new URL(href)`, `searchParams.delete("_v")` first (so `_v` never
  accumulates across attempts), then `searchParams.set("_v", String(stamp))`,
  return `url.toString()`.
- Preserves path, pre-existing query params and hash.
- Must be pure and take `href`/`stamp` as arguments — no `window`, no
  `Date.now()` inside — so it is deterministic under test.

`consumeAutoRecoveryAttempt(): boolean`
- Returns `true` at most once per browsing session, and marks the attempt in
  the same call.
- Wrap the **entire** body in `try { … } catch { return false; }` —
  per D-02, an inaccessible `sessionStorage` means fail closed (no auto-reload).
- Key: `pn:stale-bundle-reload`. If `getItem(key)` is non-null → return `false`.
  Otherwise `setItem(key, "1")` and return `true`.
- Read storage via `globalThis.sessionStorage` (not bare `sessionStorage`) so
  the node test can stub it.

`hardRecover(): void`
- `window.location.replace(buildCacheBustedUrl(window.location.href, Date.now()))`.
- `replace`, never `assign` — the broken document must not enter history, or the
  customer's back button walks straight back into it.
- Guard `typeof window === "undefined"` → no-op.

**Acceptance criteria:**
- File exists, contains no `"use server"` directive and no React import.
- `npx tsc --noEmit` passes.
- `isStaleBundleError` and `buildCacheBustedUrl` are pure — no reference to
  `window`, `document`, `Date.now()`, or `sessionStorage` inside either.

---

### Task 2 — Unit-test the detector

**Files:** `src/lib/is-stale-bundle-error.test.ts` (new)
**Depends on:** Task 1

**Action:** Vitest suite (node environment, per F-06).

`isStaleBundleError` — must return **true** for:
- `new Error('Failed to find Server Action "62dd0a82452496754f85ca77e71e61aa7a76beb5". This request might be from an older or newer deployment.')`
  (the exact production string)
- `new TypeError("Load failed")` and `new Error("load failed")` (case)
- `new TypeError("Failed to fetch")`
- `new Error("NetworkError when attempting to fetch resource.")`
- an error with `name = "ChunkLoadError"`
- `new Error("Loading chunk 482 failed.")`

`isStaleBundleError` — must return **false** for (regression guards):
- `new Error("Upload failed")` ← **the F-04 trap; this test is the point of the module**
- `new Error("Image upload failed")`
- `new Error("Payment could not be completed. Please try again.")`
- `new Error("Enter a valid address first.")`
- `null`, `undefined`, `"Load failed"` (a bare string, not an Error), `{}`, `42`

`buildCacheBustedUrl`:
- `("https://3dninjaz.com/checkout", 1757568000000)` → path preserved,
  `_v=1757568000000` present.
- Idempotent on repeat: feeding its own output back with a new stamp yields
  exactly one `_v` (assert `new URL(out).searchParams.getAll("_v").length === 1`).
- Preserves an unrelated existing param, e.g. `?ref=ig` survives.
- Preserves the hash fragment.

`consumeAutoRecoveryAttempt`:
- With a stubbed in-memory `globalThis.sessionStorage`: first call `true`,
  second and third calls `false`. Restore the stub in `afterEach`.
- With a stub whose `getItem` throws (Safari private mode): returns `false`
  and does not rethrow.

**Acceptance criteria:**
- `npx vitest run src/lib/is-stale-bundle-error.test.ts` — all green.
- The `"Upload failed"` → `false` case is present and passing.

---

### Task 3 — Wire `src/app/error.tsx`

**Files:** `src/app/error.tsx`
**Depends on:** Task 1

**Action:**
- Import `isStaleBundleError`, `consumeAutoRecoveryAttempt`, `hardRecover`.
- Compute once per mount:
  `const [recoverable] = useState(() => isStaleBundleError(error));`
  and, only when `recoverable`,
  `const [mayAutoRecover] = useState(() => consumeAutoRecoveryAttempt());`
  Both in lazy `useState` initialisers so a re-render cannot consume a second
  attempt. Do **not** call `consumeAutoRecoveryAttempt()` when `recoverable` is
  false — an unrelated crash must not burn the session's one attempt.
- Rework the existing effect (D-03):
  - still call `reportClientError({ requestId, message, stack, context })`,
    with `context` extended to
    `{ digest, staleBundle: recoverable, autoRecover: recoverable && mayAutoRecover }`;
  - if `recoverable && mayAutoRecover`, after the report settles **or** a
    ~1000 ms timeout (`Promise.race`), call `hardRecover()`;
  - clear the timer on unmount;
  - if not recoverable, behaviour is byte-for-byte what it is today.
- Button wiring (F-05 — `branded-500.tsx` is untouched):
  `<BrandedFiveHundred requestId={requestId} reset={recoverable ? hardRecover : reset} />`
  So on a stale-bundle error the manual "Try again" performs a cache-busted
  hard navigation — including on the second and later errors, when
  auto-recovery is already spent. The old `reset()` remains the handler for
  every other error class.
- Do not render `error.message` / `error.stack` anywhere (D-04).

**Acceptance criteria:**
- `npx tsc --noEmit` passes.
- Non-stale errors: identical render and identical `reportClientError` call
  shape as before, plus the two new `context` booleans.
- No JSX interpolation of `error.*` anywhere in the file (`grep -n "error\." src/app/error.tsx`
  shows hits only inside `reportClientError(...)` args and `isStaleBundleError(error)`).

---

### Task 4 — Wire `src/app/global-error.tsx`

**Files:** `src/app/global-error.tsx`
**Depends on:** Task 1, Task 3

**Action:**
Apply the identical logic from Task 3 to the global boundary — this is the
scope the production logs actually recorded (`scope: 'global-error'`), so it
must not be skipped.
- Same lazy-`useState` detection + one-shot consumption.
- Same report-then-recover effect; keep `context.scope: "global-error"` and add
  the same `staleBundle` / `autoRecover` booleans.
- Its inline `<button onClick={reset}>` becomes
  `onClick={recoverable ? hardRecover : reset}`.
- Keep the `<html><body>` wrapper and all inline styles — this file cannot
  depend on anything the root layout provides.
- Keep the `requestId` display.

**Acceptance criteria:**
- `npx tsc --noEmit` passes.
- The file still renders its own `<html>`/`<body>` and imports nothing from the
  root layout or from `branded-500.tsx`.
- No `error.message` / `error.stack` in the rendered tree.

---

### Task 5 — Static gates

**Depends on:** Tasks 1–4

**Action / acceptance criteria (all must pass):**
- `npx tsc --noEmit` → exit 0.
- `npx next lint` (or the repo's lint command as invoked by the CI
  "Install + typecheck" job) → exit 0.
- `npx vitest run src/lib/is-stale-bundle-error.test.ts` → all green.
- Diff is exactly 2 new files + 2 edited files. Confirm with `git status`:
  `src/components/error/branded-500.tsx`, `next.config.ts`, and everything under
  `src/actions/` must be **unmodified**.
- `grep -rn "use server" src/lib/is-stale-bundle-error.ts` → no hits
  (the `"use server"`-cannot-export-types trap).

---

### Task 6 — Open the PR

**Depends on:** Task 5

**Action:**
Branch `fix/stale-bundle-selfheal` off a **fresh** `origin/dev`
(`git fetch origin && git checkout -b fix/stale-bundle-selfheal origin/dev` —
the local `dev` is chronically stale). Commit, push, open a PR with base `dev`.
Never push to `master`. Delegate the commit/push to the Haiku git subagent per
project convention.
PR body must carry: the incident summary (lost RM70 order `8008dfff` /
`e3e6c870`, 427 events since June), F-03's double-charge reasoning with its
explicit "confirm or escalate" ask, and the Task 7 manual verification results.

**Acceptance criteria:**
- PR open against `dev`, CI "Install + typecheck" green.
- Not merged until Task 7 passes on dev.

---

### Task 7 — Manual verification on dev  *(checkpoint: human-verify — blocking)*

**Depends on:** Task 6 merged to `dev` and deployed to `https://app.3dninjaz.com`
(auto-deploy on push to `dev`; never deploy by hand).

Two things must be proven. Record both outcomes in the PR before promoting to
`master`.

**7a — Simulate the stale action id and prove the boundary recovers.**
Primary method (no code change, reproduces the exact client symptom):
1. Open `https://app.3dninjaz.com/checkout` on desktop Chrome with one item in
   the bag, address filled in. Open DevTools → Console.
2. Clear the guard first: `sessionStorage.removeItem("pn:stale-bundle-reload")`.
3. Patch fetch so that any Next server-action POST rejects the way iOS does:
   wrap `window.fetch` and, when the request carries a `Next-Action` header,
   `return Promise.reject(new TypeError("Load failed"))`; otherwise delegate to
   the original.
4. Click **Pay with bank transfer** (the WhatsApp path — per F-03 it is the one
   that genuinely propagates to the boundary).
5. **Expect:** the 500 page paints, then within ~1 s the tab hard-navigates to
   `/checkout?_v=<timestamp>`. The fetch patch is gone (fresh document), the bag
   is still populated (F-01), and the URL contains exactly one `_v`.

Secondary method, to exercise the genuine server-side error rather than a
simulated fetch rejection — best effort, do not block on it: load `/checkout`
in a tab, then push a commit that edits `src/actions/whatsapp-order.ts` (a
comment is enough to change the module hash) and let dev redeploy **without
reloading that tab**; then click the button. The server log should show a real
`Failed to find Server Action` and the tab should self-heal identically.

**7b — Prove the auto-reload fires at most once per session.**
1. In the recovered tab (same session, `_v` in the URL), confirm
   `sessionStorage.getItem("pn:stale-bundle-reload") === "1"`.
2. Re-apply the fetch patch from 7a and click the button again.
3. **Expect:** the 500 page renders and **stays** — no automatic navigation.
   Reference id is visible. Clicking "Try again" performs one manual
   cache-busted hard navigation (URL still has exactly one `_v`, with a new
   timestamp).
4. Open a fresh tab (new session) → the guard is absent → auto-recovery is armed
   again.
5. Also check an unrelated error does not burn the attempt: in a brand-new tab,
   throw a non-matching error, confirm `pn:stale-bundle-reload` is still absent.

**7c — Log check.** SSH to the box and confirm the dev app log now shows
`autoRecover: true` on these events. This is the metric that tells us, after
the next real deploy, whether the 427-per-quarter dead-ends became recoveries.

**Resume signal:** reply `approved` to promote `dev` → `master`, or describe
what deviated.

---

## Follow-ups (not this PR)

- Persist the guest shipping-address draft (sessionStorage) so a recovery at
  `/checkout` does not blank a guest's typed address (F-01).
- `deploymentId` / cache-header work to stop the skew at the source — the
  boundary fix treats the symptom, not the cause.
- Consider running vitest in CI (F-06).
- "Reloading…" interstitial in `branded-500.tsx` (D-05).
