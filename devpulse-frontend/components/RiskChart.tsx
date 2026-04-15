"use client";
import React from "react";

interface RiskChartProps {
  data?: number[];
}

export default function RiskChart({ data }: RiskChartProps) {
  const chartData = data || [40, 65, 30, 80, 55, 90, 20, 45, 60, 75, 50, 30];

  const maxVal = Math.max(...chartData);
  const avgVal = chartData.reduce((a, b) => a + b, 0) / chartData.length;

  return (
    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 mt-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Cost Velocity (Tokens/Sec)</h3>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-600 rounded"></div>
            <span className="text-gray-400">Usage</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-500 rounded"></div>
            <span className="text-gray-400">Avg: {avgVal.toFixed(0)}</span>
          </div>
        </div>
      </div>
      <div className="h-48 flex items-end space-x-2">
        {chartData.map((h, i) => {
          const height = (h / maxVal) * 100;
          const isAboveAvg = h > avgVal;
          return (
            <div
              key={i}
              className={`flex-1 rounded-t transition-all hover:opacity-80 cursor-pointer ${
                isAboveAvg ? "bg-blue-500" : "bg-blue-700"
              }`}
              style={{ height: `${height}%` }}
              title={`Value: ${h}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>12 calls ago</span>
        <span>Now</span>
      </div>
    </div>
  );
}
