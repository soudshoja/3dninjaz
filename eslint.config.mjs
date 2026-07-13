import tsParser from "@typescript-eslint/parser";

// Deviation (Rule 1 - bug, 24-10 Task 3): the codebase pre-dates any ESLint
// config and carries scattered `eslint-disable-next-line <rule>` comments
// anticipating a fuller Next.js/TS/react-hooks preset that was never
// installed. Adding a REAL eslint config (this file, the first one in the
// repo) makes ESLint validate those directive comments, and an unrecognized
// rule id is a hard ESLint error ("Definition for rule 'x' was not found"),
// not a warning — which would fail `npm run lint` on files this plan never
// touched. These stub plugin objects register ONLY the rule ids referenced
// by existing disable comments (no logic, `create: () => ({})`) so ESLint
// resolves them to a harmless no-op — same "unused disable directive"
// warning class already emitted for core rules like no-var/no-console.
// This does NOT enable any framework preset; the only rule this config
// actually enforces is no-restricted-imports below.
function stubPlugin(ruleNames) {
  return {
    rules: Object.fromEntries(
      ruleNames.map((name) => [name, { create: () => ({}) }]),
    ),
  };
}

export default [
  // Global ignores (I1) — never lint build output.
  { ignores: [".next/**", "node_modules/**", "dist/**", "build/**", "*.config.mjs"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    // The resolver layer is the ONLY sanctioned src reader of the singleton.
    ignores: ["src/lib/tenant/**", "src/lib/db/**"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: {
      "@next/next": stubPlugin(["no-img-element"]),
      "@typescript-eslint": stubPlugin(["no-explicit-any", "no-unused-vars"]),
      "react-hooks": stubPlugin(["exhaustive-deps"]),
    },
    rules: {
      "no-restricted-imports": ["error", {
        // @/lib/paypal (__paypalClient) is INTENTIONALLY NOT banned — Phase 29.
        paths: [
          { name: "@/lib/db", importNames: ["db", "__singletonDb", "__singletonPool"],
            message: "Resolve tenant db via getTenantContext()/requireAdmin()/requireUser(); __singletonDb/__singletonPool are resolver-only." },
          { name: "@/lib/auth", importNames: ["auth"],
            message: "Resolve auth via getTenantContext()/getTenantAuth(), not the singleton." },
        ],
        // patterns catches relative/alt path forms of the same modules (I1).
        // Deviation (Rule 1 - bug fix): a gitignore-style `group` entry for
        // the db module (e.g. "**/lib/db") is UNFIXABLE here — the `ignore`
        // package (which powers `group`) treats a bare trailing segment as a
        // directory match, so it also recursively swept in the UNRELATED,
        // legitimate `@/lib/db/schema` submodule (a namespace import,
        // conservatively flagged whenever importNames is set). Verified
        // empirically that a "!**/lib/db/schema" negation does NOT undo
        // this — git/ignore has no supported way to re-include a path under
        // an already-matched directory pattern. `regex` (an ESLint-native,
        // non-gitignore alternative already supported by this same rule)
        // sidesteps the whole class of bug via a real end-of-string anchor:
        // it matches relative/aliased forms ending in exactly "lib/db" or
        // "lib/db/index", never "lib/db/schema".
        patterns: [
          { regex: "(^|/)lib/db(/index)?$", importNames: ["db", "__singletonDb", "__singletonPool"],
            message: "Singleton db/pool is resolver-only." },
          { group: ["**/lib/auth"], importNames: ["auth"],
            message: "Resolve auth via context, not the singleton." },
        ],
      }],
    },
  },
];
