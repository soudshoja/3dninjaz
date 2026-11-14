import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { resolveRange, formatYmd } from "@/lib/date-range";
import { getSummaryReport, type GroupRow } from "@/lib/accounting-summary";
import { getSstEnabled } from "@/lib/accounting";
import {
  BANK_MATCH_LABELS,
  INCOME_KIND_LABELS,
} from "@/lib/accounting-types";
import { DateRangePicker } from "@/components/admin/date-range-picker";
import { StatCard, Notice, signedColor } from "@/components/admin/accounting-ui";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Net position",
  robots: { index: false, follow: false },
};

const NUM = "text-right tabular-nums";

function Money({ n, className }: { n: number; className?: string }) {
  return (
    <span className={className} style={{ color: signedColor(n) }}>
      {formatMYR(n)}
    </span>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="font-bold text-xl">{title}</h2>
      {hint ? <p className="mt-0.5 mb-3 text-xs text-slate-500">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-white p-2 sm:p-3">{children}</div>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-6 text-center text-sm text-slate-500">{children}</p>;
}

function GroupTable({ title, rows, firstCol }: { title: string; rows: GroupRow[]; firstCol: string }) {
  return (
    <div>
      <h3 className="mb-1 px-1 text-sm font-semibold">{title}</h3>
      <Panel>
        {rows.length === 0 ? (
          <Empty>No supplies recorded in this range.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{firstCol}</TableHead>
                <TableHead className={NUM}>Rows</TableHead>
                <TableHead className={NUM}>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((g) => (
                <TableRow key={g.key}>
                  <TableCell className="font-medium whitespace-normal">{g.label}</TableCell>
                  <TableCell className={NUM}>{g.count}</TableCell>
                  <TableCell className={NUM}>{formatMYR(g.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}

export default async function NetPositionPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveRange(sp, { defaultPreset: "all" });
  const [r, sstEnabled] = await Promise.all([getSummaryReport(range), getSstEnabled()]);
  const { cash, margin, position, machines } = r;

  return (
    <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link
          href="/admin/accounting"
          className="text-sm underline decoration-dotted"
          style={{ color: BRAND.ink }}
        >
          ← Back to accounting
        </Link>
        <h1 className="mt-3 font-[var(--font-heading)] text-3xl md:text-4xl">Net position</h1>
        <p className="mt-1 text-slate-600">
          {range.label}
          {range.from && range.to ? ` (${formatYmd(range.from)} to ${formatYmd(range.to)})` : ""}.
          Where the business stands after profit, machines and funding. Shipping is passed
          through and left out.
        </p>

        <div className="mt-4">
          <DateRangePicker current={range} />
        </div>

        {sstEnabled ? (
          <Notice>
            SST is switched on in store settings. These figures do not model SST, so treat
            them as before-tax approximations.
          </Notice>
        ) : null}
        {cash.estimatedDateAmount > 0 ? (
          <Notice>
            Includes {formatMYR(cash.estimatedDateAmount)} at estimated dates. Those rows may
            move between periods once the real dates are known.
          </Notice>
        ) : null}
        {!margin.enoughData ? (
          <Notice>
            Only {Math.round(margin.coverage * 100)}% of order lines have a product cost, so
            gross margin is not shown. The net position below does not use product cost.
          </Notice>
        ) : null}
        {position.assetsWithoutPayments > 0 ? (
          <Notice>
            {position.assetsWithoutPayments} asset
            {position.assetsWithoutPayments === 1 ? " has" : "s have"} no payment recorded, so
            {position.assetsWithoutPayments === 1 ? " it is" : " they are"} not counted in the
            position. Record the payment on the{" "}
            <Link href="/admin/accounting/assets" className="underline">
              assets page
            </Link>
            .
          </Notice>
        ) : null}

        {/* Headline */}
        <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label="Net profit (cash)"
            value={formatMYR(position.netProfitCash)}
            accent={position.netProfitCash >= 0 ? BRAND.green : "#dc2626"}
            big
          />
          <StatCard
            label="Net position now"
            value={formatMYR(position.now)}
            accent={position.now >= 0 ? BRAND.green : "#dc2626"}
            big
          />
          <StatCard
            label="After instalments are paid"
            value={formatMYR(position.afterInstalments)}
            sub={`${formatMYR(position.instalmentsOwed)} still owed on instalments`}
            accent={position.afterInstalments >= 0 ? BRAND.green : "#dc2626"}
            big
          />
        </section>

        <Section
          title="How the position is worked out"
          hint="Net profit (cash) = sales excl. shipping + other income − PayPal fees − expenses."
        >
          <Panel>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell>Net profit (cash)</TableCell>
                  <TableCell className={NUM}>
                    <Money n={position.netProfitCash} />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Minus asset payments made</TableCell>
                  <TableCell className={NUM}>{formatMYR(-position.assetPaymentsMade)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Plus capital in</TableCell>
                  <TableCell className={NUM}>{formatMYR(position.capitalIn)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Minus capital out</TableCell>
                  <TableCell className={NUM}>{formatMYR(-position.capitalOut)}</TableCell>
                </TableRow>
                <TableRow className="font-semibold">
                  <TableCell>Net position now</TableCell>
                  <TableCell className={NUM}>
                    <Money n={position.now} />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Minus still owed on instalments (all time)</TableCell>
                  <TableCell className={NUM}>{formatMYR(-position.instalmentsOwed)}</TableCell>
                </TableRow>
                <TableRow className="font-semibold">
                  <TableCell>Once every instalment is paid</TableCell>
                  <TableCell className={NUM}>
                    <Money n={position.afterInstalments} />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Panel>
        </Section>

        {/* Machines */}
        <Section
          title="Machines and other assets"
          hint="Assets are kept out of profit. Paid is for the selected range; still to pay is the all-time balance on instalment plans, whatever range is chosen."
        >
          <Panel>
            {machines.rows.length === 0 ? (
              <Empty>No assets recorded yet.</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead className="hidden sm:table-cell">Seller</TableHead>
                    <TableHead className={NUM}>Total</TableHead>
                    <TableHead className={NUM}>Paid</TableHead>
                    <TableHead className={NUM}>Still to pay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {machines.rows.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium whitespace-normal">
                        {a.name}
                        {a.isInstalment && a.instalmentCount ? (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            {a.paymentsCount} of {a.instalmentCount} instalments paid
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell whitespace-normal text-slate-600">
                        {a.seller ?? "—"}
                      </TableCell>
                      <TableCell className={NUM}>{formatMYR(a.total)}</TableCell>
                      <TableCell className={NUM}>{formatMYR(a.paidInRange)}</TableCell>
                      <TableCell className={NUM}>
                        {a.isInstalment ? formatMYR(a.stillToPay) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">Total</TableCell>
                    <TableCell className="hidden sm:table-cell" />
                    <TableCell className={`${NUM} font-semibold`}>{formatMYR(machines.total)}</TableCell>
                    <TableCell className={`${NUM} font-semibold`}>
                      {formatMYR(machines.paidInRange)}
                    </TableCell>
                    <TableCell className={`${NUM} font-semibold`}>
                      {formatMYR(machines.stillToPay)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </Panel>
        </Section>

        {/* Supplies */}
        <Section
          title="Supplies and other costs"
          hint={`Everything that is not a project, designer or marketing cost. Total ${formatMYR(r.supplies.total)}.`}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <GroupTable title="By source" rows={r.supplies.bySource} firstCol="Supplier" />
            <GroupTable title="By subcategory" rows={r.supplies.bySubcategory} firstCol="Subcategory" />
          </div>
          <div className="mt-4">
            <h3 className="mb-1 px-1 text-sm font-semibold">By bank match</h3>
            <Panel>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead className={NUM}>Rows</TableHead>
                    <TableHead className={NUM}>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.supplies.byBankMatch.map((m) => (
                    <TableRow key={m.status}>
                      <TableCell>
                        <Badge variant={m.status === "matched" ? "secondary" : "outline"}>
                          {BANK_MATCH_LABELS[m.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className={NUM}>{m.count}</TableCell>
                      <TableCell className={NUM}>{formatMYR(m.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </div>
        </Section>

        {/* Designer + marketing */}
        <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard
            label="Designer"
            value={formatMYR(r.designer.total)}
            sub={`${r.designer.count} payment${r.designer.count === 1 ? "" : "s"}`}
          />
          <StatCard
            label="Marketing"
            value={formatMYR(r.marketing.total)}
            sub={`${r.marketing.count} payment${r.marketing.count === 1 ? "" : "s"}`}
          />
        </section>

        {/* Projects */}
        <Section
          title="Projects"
          hint="Costs and income that carry a project tag. Project costs are not repeated in the sections above."
        >
          <Panel>
            {r.projects.length === 0 ? (
              <Empty>No project-tagged costs or income in this range.</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead className={NUM}>Costs</TableHead>
                    <TableHead className={NUM}>Income</TableHead>
                    <TableHead className={NUM}>Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.projects.map((p) => (
                    <TableRow key={p.tag}>
                      <TableCell className="font-medium">{p.tag}</TableCell>
                      <TableCell className={NUM}>{formatMYR(p.costs)}</TableCell>
                      <TableCell className={NUM}>{formatMYR(p.income)}</TableCell>
                      <TableCell className={`${NUM} font-semibold`}>
                        <Money n={p.profit} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>
        </Section>

        {/* Income */}
        <Section
          title="Income"
          hint="Website sales come from paid orders. Other lines are entered by hand."
        >
          <Panel>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Kind</TableHead>
                  <TableHead className={NUM}>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Website sales (excl. shipping)</TableCell>
                  <TableCell className="hidden sm:table-cell text-slate-500">From orders</TableCell>
                  <TableCell className="hidden sm:table-cell" />
                  <TableCell className={NUM}>{formatMYR(r.income.websiteSales)}</TableCell>
                </TableRow>
                {r.income.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium whitespace-normal">
                      {l.source}
                      {l.projectTag ? (
                        <span className="ml-2 text-xs font-normal text-slate-500">{l.projectTag}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell whitespace-nowrap">
                      {formatYmd(l.date)}
                      {l.dateIsEstimate ? (
                        <Badge variant="outline" className="ml-2">
                          Estimated
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{INCOME_KIND_LABELS[l.kind]}</TableCell>
                    <TableCell className={NUM}>{formatMYR(l.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Total income</TableCell>
                  <TableCell className="hidden sm:table-cell" />
                  <TableCell className="hidden sm:table-cell" />
                  <TableCell className={`${NUM} font-semibold`}>{formatMYR(r.income.total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Panel>
        </Section>

        {/* Funding */}
        <Section title="Funding" hint="Money put in or taken out by the owners. Not profit.">
          <Panel>
            {r.funding.lines.length === 0 ? (
              <Empty>No capital in or out in this range.</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead className={NUM}>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.funding.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium whitespace-normal">{l.source}</TableCell>
                      <TableCell className="hidden sm:table-cell whitespace-nowrap">
                        {formatYmd(l.date)}
                        {l.dateIsEstimate ? (
                          <Badge variant="outline" className="ml-2">
                            Estimated
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>{INCOME_KIND_LABELS[l.kind]}</TableCell>
                      <TableCell className={NUM}>{formatMYR(l.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>
        </Section>

        {/* Totals */}
        <Section title="Totals">
          <Panel>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell>Income (website sales + other income)</TableCell>
                  <TableCell className={NUM}>{formatMYR(r.totals.income)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Expenses</TableCell>
                  <TableCell className={NUM}>{formatMYR(-cash.expensesTotal)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>PayPal fees</TableCell>
                  <TableCell className={NUM}>{formatMYR(-r.totals.paypalFees)}</TableCell>
                </TableRow>
                <TableRow className="font-semibold">
                  <TableCell>Net profit (cash)</TableCell>
                  <TableCell className={NUM}>
                    <Money n={r.totals.netProfit} />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Panel>
        </Section>
      </div>
    </main>
  );
}
