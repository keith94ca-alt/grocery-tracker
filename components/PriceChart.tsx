"use client";

import { useMemo } from "react";
import { normalizePrice } from "@/lib/units";

interface PricePoint {
  date: string;
  unitPrice: number;
  unit: string;
  store: string;
}

/** Pick up to 5 evenly-spaced indices from the sorted array for x-axis labels */
function pickDateIndices(count: number): number[] {
  if (count <= 5) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / 4;
  return [0, 1, 2, 3, 4].map((i) => Math.round(i * step));
}

const PADDING_X = 50;

export default function PriceChart({ entries }: { entries: PricePoint[] }) {
  const chartData = useMemo(() => {
    if (entries.length < 2) return null;

    const sorted = [...entries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Normalize all prices to canonical unit (per kg / per L)
    const normalized = sorted.map((e) => ({
      ...e,
      unitPrice: normalizePrice(e.unitPrice, e.unit).price,
      unit: normalizePrice(e.unitPrice, e.unit).unit,
    }));

    const prices = normalized.map((e) => e.unitPrice);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const paddedMin = min - range * 0.1;
    const paddedMax = max + range * 0.1;
    const paddedRange = paddedMax - paddedMin;

    // Wider viewBox for better readability, taller to fit x-axis dates
    const width = 500;
    const height = 160;
    
    const paddingY = 12;
    const paddingBottom = 30; // extra space for date labels
    const chartW = width - PADDING_X * 2;
    const chartH = height - paddingY - paddingBottom;

    const points = normalized.map((entry, i) => {
      const x = PADDING_X + (i / (normalized.length - 1)) * chartW;
      const y = paddingY + (1 - (entry.unitPrice - paddedMin) / paddedRange) * chartH;
      return { x, y, entry };
    });

    const pathD = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");

    const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height - paddingBottom} L ${points[0].x.toFixed(1)} ${height - paddingBottom} Z`;

    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const avgY = paddingY + (1 - (avg - paddedMin) / paddedRange) * chartH;

    // Date label positions
    const dateIndices = pickDateIndices(normalized.length);

    return {
      points,
      pathD,
      areaD,
      width,
      height,
      paddingBottom,
      avgY,
      avg,
      min,
      max,
      paddedMin,
      paddedMax,
      normalized,
      dateIndices,
      firstDate: sorted[0].date,
      lastDate: sorted[sorted.length - 1].date,
    };
  }, [entries]);

  if (!chartData) {
    return (
      <div className="bg-gray-50 rounded-xl p-4 text-center text-sm text-gray-400">
        Need at least 2 price entries for a chart
      </div>
    );
  }

  const { points, pathD, areaD, width, height, paddingBottom, avgY, avg, min, max, normalized, dateIndices, firstDate, lastDate } = chartData;

  function formatDateShort(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  }

  function formatDateMedium(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "2-digit" });
  }

  const firstPrice = normalized[0].unitPrice;
  const lastPrice = normalized[normalized.length - 1].unitPrice;
  const trendUp = lastPrice > firstPrice;
  const trendPercent = ((lastPrice - firstPrice) / firstPrice * 100).toFixed(1);

  return (
    <div className="space-y-3">
      {/* Trend summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${trendUp ? "text-red-600" : "text-green-600"}`}>
            {trendUp ? "📈" : "📉"} {trendUp ? "+" : ""}{trendPercent}%
          </span>
          <span className="text-xs text-gray-400">
            {normalized.length} entries · {formatDateShort(firstDate)} – {formatDateShort(lastDate)}
          </span>
        </div>
      </div>

      {/* Chart — responsive, bigger on desktop */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 -mx-1 lg:mx-0">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          style={{ height: "auto", maxHeight: "clamp(160px, 25vw, 320px)" }}
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = 12 + pct * (height - paddingBottom - 12);
            const price = chartData.paddedMax - pct * (chartData.paddedMax - chartData.paddedMin);
            return (
              <g key={pct}>
                <line
                  x1={PADDING_X} y1={y} x2={width - PADDING_X} y2={y}
                  className="stroke-gray-200 dark:stroke-gray-700"
                />
                <text x={PADDING_X - 4} y={y + 3} fontSize={8} fill="#9ca3af" textAnchor="end">
                  ${price.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Average line */}
          <line
            x1={PADDING_X} y1={avgY} x2={width - PADDING_X} y2={avgY}
            stroke="#f59e0b" strokeWidth={1} strokeDasharray="4,3"
          />
          <text x={width - PADDING_X - 4} y={avgY - 4} fontSize={8} fill="#f59e0b" textAnchor="end">
            avg ${avg.toFixed(2)}
          </text>

          {/* Area fill */}
          <path d={areaD} fill="url(#chartGradient)" opacity={0.3} />

          {/* Line */}
          <path d={pathD} fill="none" stroke="#16a34a" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {/* Dots */}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill="#16a34a" className="stroke-white dark:stroke-gray-800" strokeWidth={1.5} />
          ))}

          {/* Date labels on x-axis */}
          {dateIndices.map((idx) => {
            const p = points[idx];
            if (!p) return null;
            return (
              <text
                key={idx}
                x={p.x}
                y={height - 4}
                fontSize={8}
                fill="#6b7280"
                textAnchor="middle"
              >
                {formatDateMedium(p.entry.date)}
              </text>
            );
          })}

          {/* Bottom axis line */}
          <line
            x1={PADDING_X} y1={height - paddingBottom}
            x2={width - PADDING_X} y2={height - paddingBottom}
            className="stroke-gray-300 dark:stroke-gray-600"
          />

          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" />
              <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Stats row */}
      <div className="flex justify-around text-center">
        <div>
          <p className="text-xs text-gray-400">Lowest</p>
          <p className="text-sm font-bold text-green-600">${min.toFixed(2)}/{(normalized[0]?.unit || "").replace("per ", "")}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Average</p>
          <p className="text-sm font-bold text-gray-700">${avg.toFixed(2)}/{(normalized[0]?.unit || "").replace("per ", "")}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Highest</p>
          <p className="text-sm font-bold text-red-600">${max.toFixed(2)}/{(normalized[0]?.unit || "").replace("per ", "")}</p>
        </div>
      </div>
    </div>
  );
}
