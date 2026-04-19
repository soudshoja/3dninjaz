import { BRAND } from "@/lib/brand";

type Variant = {
  size: "S" | "M" | "L";
  widthCm: string | null;
  heightCm: string | null;
  depthCm: string | null;
};

const SIZE_LABEL: Record<Variant["size"], string> = {
  S: "Small",
  M: "Medium",
  L: "Large",
};

function cm(v: string | null): string {
  if (v === null || v === undefined) return "—";
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1)} cm`;
}

/**
 * Dimension table per variant (PROD-04). Pure presentation — works as
 * either a server or client component. Missing dimensions render as
 * em-dashes rather than "0 cm" so the user knows the value is unknown.
 */
export function SizeGuide({ variants }: { variants: Variant[] }) {
  if (!variants.length) return null;
  return (
    <section aria-labelledby="size-guide-heading" className="mt-6">
      <h3
        id="size-guide-heading"
        className="font-[var(--font-heading)] text-xl mb-3"
        style={{ color: BRAND.ink }}
      >
        Size guide
      </h3>
      <div
        className="overflow-x-auto rounded-2xl border-2"
        style={{ borderColor: BRAND.ink }}
      >
        <table className="w-full text-left">
          <thead style={{ backgroundColor: `${BRAND.ink}08` }}>
            <tr>
              <th className="p-3 font-bold">Size</th>
              <th className="p-3 font-bold">Width</th>
              <th className="p-3 font-bold">Height</th>
              <th className="p-3 font-bold">Depth</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr
                key={v.size}
                className="border-t"
                style={{ borderColor: "#0B102015" }}
              >
                <td className="p-3 font-bold">
                  {v.size}{" "}
                  <span className="text-slate-500 font-normal">
                    ({SIZE_LABEL[v.size]})
                  </span>
                </td>
                <td className="p-3">{cm(v.widthCm)}</td>
                <td className="p-3">{cm(v.heightCm)}</td>
                <td className="p-3">{cm(v.depthCm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
