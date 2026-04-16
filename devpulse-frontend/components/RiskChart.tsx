"use client";
import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

interface RiskChartProps {
  data?: number[];
}

export default function RiskChart({ data }: RiskChartProps) {
  const chartData = data && data.length > 0 ? data.map((val, i) => ({
    call: i + 1,
    cost: val
  })) : Array.from({ length: 12 }, (_, i) => ({
    call: i + 1,
    cost: 40 + Math.random() * 50
  }));

  const maxVal = Math.max(...chartData.map(d => d.cost));
  const avgVal = chartData.reduce((a, b) => a + b.cost, 0) / chartData.length;

  return (
    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 mt-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Cost Velocity (USD/Call)</h3>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-600 rounded"></div>
            <span className="text-gray-400">Usage</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-500 rounded"></div>
            <span className="text-gray-400">Avg: ${avgVal.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="call" 
            stroke="#9CA3AF" 
            tick={{ fill: "#9CA3AF" }}
          />
          <YAxis 
            stroke="#9CA3AF" 
            tick={{ fill: "#9CA3AF" }}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: "#1e293b", borderColor: "#475569", color: "#fff" }}
            itemStyle={{ color: "#fff" }}
          />
          <Area 
            type="monotone" 
            dataKey="cost" 
            stroke="#3b82f6" 
            fill="#3b82f6"
            fillOpacity={0.3}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
