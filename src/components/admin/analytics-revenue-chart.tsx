"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { BRAND } from "@/lib/brand";

type Point = { day: string; revenue: number };

/**
 * Revenue line chart for /admin. Daily buckets, brand-green line.
 * `ResponsiveContainer` makes the chart fill its parent — the parent must
 * have an explicit height for the container to compute its size.
 */
export function AnalyticsRevenueChart({ data }: { data: Point[] }) {
  const formatTick = (v: string) => v.slice(5); // "MM-DD"
  const formatY = (v: number) => `RM${Math.round(v)}`;

  return (
    <div className="w-full h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={`${BRAND.ink}11`} />
          <XAxis
            dataKey="day"
            tickFormatter={formatTick}
            tick={{ fontSize: 11, fill: BRAND.ink }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={formatY}
            tick={{ fontSize: 11, fill: BRAND.ink }}
            width={56}
          />
          <Tooltip
            formatter={(value) => {
              const n = typeof value === "number" ? value : Number(value);
              return [Number.isFinite(n) ? `RM ${n.toFixed(2)}` : "RM 0.00", "Revenue"];
            }}
            labelStyle={{ color: BRAND.ink }}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke={BRAND.green}
            strokeWidth={3}
            dot={{ r: 3, fill: BRAND.green }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
