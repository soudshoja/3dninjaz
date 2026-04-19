/**
 * JsonLd — server component that safely emits a schema.org JSON-LD block as a
 * <script type="application/ld+json"> tag.
 *
 * Uses React's JSX text-children pattern: React automatically escapes text
 * children, so `JSON.stringify(data)` as the script's children is safe when
 * `data` is fully server-controlled (as it is for Organization / WebSite
 * blocks fed from `src/lib/site-metadata.ts`).
 *
 * Reference: https://nextjs.org/docs/app/building-your-application/optimizing/metadata#json-ld
 */

type JsonLdData = Record<string, unknown>;

export function JsonLd({ data }: { data: JsonLdData }) {
  return (
    <script type="application/ld+json">{JSON.stringify(data)}</script>
  );
}
