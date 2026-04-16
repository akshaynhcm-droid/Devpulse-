"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

export default function TokenAnalyticsPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await fetch(`${API_BASE}/token-analytics/`);
        const json = await res.json();
        setAnalytics(json);
      } catch (err) {
        console.error("Failed to fetch analytics:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-400">Token Analytics</h1>
            <p className="text-gray-400 mt-1">Track LLM token usage and costs by model</p>
          </div>
          <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
            &larr; Dashboard
          </Link>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading analytics...</p>
        ) : (
          <div>
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Cost Breakdown by Model</h2>
              {analytics?.breakdown ? (
                <div className="space-y-3">
                  {analytics.breakdown.map((item: any) => (
                    <div key={item.model} className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between">
                      <div>
                        <h3 className="font-semibold">{item.model}</h3>
                        <div className="text-sm text-gray-400 mt-1">
                          {item.prompt_tokens.toLocaleString()} prompt tokens
                        </div>
                        <div className="text-sm text-gray-400">
                          {item.completion_tokens.toLocaleString()} completion tokens
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-green-400">${item.total_cost.toFixed(4)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No data available</p>
              )}
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-4">Recent Usage Records</h2>
              {analytics?.records && analytics.records.length > 0 ? (
                <div className="space-y-2">
                  {analytics.records.map((record: any) => (
                    <div key={record.id} className="bg-gray-800 p-3 rounded-lg border border-gray-700 flex justify-between items-center">
                      <div>
                        <span className="text-sm font-mono text-blue-300">{record.model}</span>
                        <span className="text-xs text-gray-500 ml-2">{record.recorded_at}</span>
                      </div>
                      <div className="text-sm text-gray-400">
                        {record.prompt_tokens.toLocaleString()}p / {record.completion_tokens.toLocaleString()}c
                      </div>
                      <div className="text-green-400 text-sm">${record.cost_usd.toFixed(6)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No records yet</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
