import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";

type Product = {
  productId: string;
  productName: string;
  totalRevenue: number;
  totalQuantity: number;
};

/**
 * Top-5 product list with horizontal bar widths proportional to revenue.
 * Pure server-rendered (no client JS). Empty state messaging when there are
 * no qualifying orders in range.
 */
export function AnalyticsTopProducts({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        No paid orders in this range yet.
      </p>
    );
  }
  const max = products[0]?.totalRevenue || 0;

  return (
    <ul className="space-y-3">
      {products.map((p, i) => {
        const pct = max > 0 ? (p.totalRevenue / max) * 100 : 0;
        return (
          <li key={p.productId}>
            <div className="flex items-baseline justify-between text-sm gap-3">
              <span className="font-semibold truncate min-w-0">
                <span className="text-slate-400 mr-2">{i + 1}</span>
                {p.productName}
              </span>
              <span className="font-mono whitespace-nowrap">
                {formatMYR(p.totalRevenue)}
                <span className="ml-2 text-xs text-slate-500">
                  ×{p.totalQuantity}
                </span>
              </span>
            </div>
            <div
              className="mt-1 h-2 w-full rounded-full"
              style={{ backgroundColor: `${BRAND.ink}11` }}
            >
              <div
                className="h-2 rounded-full"
                style={{ width: `${pct}%`, backgroundColor: BRAND.blue }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
