"use client";

import { useMemo } from "react";

interface PricePoint {
  date: string;
  unitPrice: number;
  store: string;
}

export default function PriceChart({ entries }: { entries: PricePoint[] }) {
  const chartData = useMemo(() => {
    if (entries.length < 2) return null;

    // Sort chronologically (oldest first)
    const sorted = [...entries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const prices = sorted.map((e) => e.unitPrice);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    // Add 10% padding
    const paddedMin = min - range * 0.1;
    const paddedMax = max + range * 0.1;
    const paddedRange = paddedMax - paddedMin;

    const width = 320;
    const height = 120;
    const paddingX = 8;
    const paddingY = 12;
    const chartW = width - paddingX * 2;
    const chartH = height - paddingY * 2;

    const points = sorted.map((entry, i) => {
      const x = paddingX + (i / (sorted.length - 1)) * chartW;
      const y = paddingY + (1 - (entry.unitPrice - paddedMin) / paddedRange) * chartH;
      return { x, y, entry };
    });

    // Build SVG path
    const pathD = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");

    // Area fill path
    const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height - paddingY} L ${points[0].x.toFixed(1)} ${height - paddingY} Z`;

    // Average line
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const avgY = paddingY + (1 - (avg - paddedMin) / paddedRange) * chartH;

    return {
      points,
      pathD,
      areaD,
      width,
      height,
      avgY,
      avg,
      min,
      max,
      paddedMin,
      paddedMax,
      sorted,
    };
  }, [entries]);

  if (!chartData) {
    return (
      <div className="bg-gray-50 rounded-xl p-4 text-center text-sm text-gray-400">
        Need at least 2 price entries for a chart
      </div>
    );
  }

  const { points, pathD, areaD, width, height, avgY, avg, min, max, sorted } = chartData;

  // Format date for tooltip
  function formatDateShort(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  }

  // Determine trend direction
  const firstPrice = sorted[0].unitPrice;
  const lastPrice = sorted[sorted.length - 1].unitPrice;
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
            {sorted.length} entries · {formatDateShort(sorted[0].date)} – {formatDateShort(sorted[sorted.length - 1].date)}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-gray-50 rounded-xl p-3 -mx-1">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          style={{ height: "auto", maxHeight: 140 }}
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = 12 + pct * (height - 24);
            const price = chartData.paddedMax - pct * (chartData.paddedMax - chartData.paddedMin);
            return (
              <g key={pct}>
                <line
                  x1={8} y1={y} x2={width - 8} y2={y}
                  stroke="#e5e7eb" strokeWidth={1}
                />
                <text x={4} y={y + 3} fontSize={7} fill="#9ca3af">
                  ${price.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Average line */}
          <line
            x1={8} y1={avgY} x2={width - 8} y2={avgY}
            stroke="#f59e0b" strokeWidth={1} strokeDasharray="4,3"
          />
          <text x={width - 6} y={avgY - 3} fontSize={7} fill="#f59e0b" textAnchor="end">
            avg ${avg.toFixed(2)}
          </text>

          {/* Area fill */}
          <path d={areaD} fill="url(#chartGradient)" opacity={0.3} />

          {/* Line */}
          <path d={pathD} fill="none" stroke="#16a34a" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {/* Dots */}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill="#16a34a" stroke="white" strokeWidth={1.5} />
          ))}

          {/* Gradient definition */}
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
          <p className="text-sm font-bold text-green-600">${min.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Average</p>
          <p className="text-sm font-bold text-gray-700">${avg.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Highest</p>
          <p className="text-sm font-bold text-red-600">${max.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}
