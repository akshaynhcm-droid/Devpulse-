"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

interface AnalyticsData {
  total_cost: number;
  recent_calls: any[];
  security_events: any[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await fetch(`${API_BASE}/analytics/summary`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Failed to fetch analytics:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-400">Analytics</h1>
            <p className="text-gray-400 mt-1">
              Cost breakdown and security event history
            </p>
          </div>
          <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
            &larr; Back to Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-gray-400 text-sm uppercase tracking-wide">
              Total Cost
            </h3>
            <p className="text-4xl font-bold mt-2 text-green-400">
              ${(data?.total_cost || 0).toFixed(4)}
            </p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-gray-400 text-sm uppercase tracking-wide">
              API Calls
            </h3>
            <p className="text-4xl font-bold mt-2 text-blue-400">
              {data?.recent_calls?.length || 0}
            </p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-gray-400 text-sm uppercase tracking-wide">
              Security Events
            </h3>
            <p className="text-4xl font-bold mt-2 text-purple-400">
              {data?.security_events?.length || 0}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Recent API Calls</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {data?.recent_calls?.length === 0 ? (
                <EmptyState
                  compact
                  icon={<span>📊</span>}
                  title="No API calls yet"
                  description="Wire up the DevPulse SDK or VS Code extension so we can stream token usage into this view."
                />
              ) : (
                data?.recent_calls?.map((call, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center bg-gray-700/50 p-3 rounded"
                  >
                    <div>
                      <span className="text-blue-300 font-mono text-sm">
                        {call.model}
                      </span>
                      <span className="text-gray-500 text-xs ml-2">
                        {call.agent_id}
                      </span>
                    </div>
                    <span className="text-green-400">
                      ${(call.cost_usd || 0).toFixed(6)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Security Events</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {data?.security_events?.length === 0 ? (
                <EmptyState
                  compact
                  icon={<span>🛡️</span>}
                  title="No security events"
                  description="A clean board is a good board. Run a scan on your collections to surface potential issues."
                  actions={[
                    {
                      label: "Run a scan",
                      href: "/scanning",
                      variant: "secondary",
                    },
                  ]}
                />
              ) : (
                data?.security_events?.map((event, i) => (
                  <div key={i} className="bg-gray-700/50 p-3 rounded">
                    <div className="flex justify-between items-center">
                      <span
                        className={`font-bold text-sm ${
                          event.severity === "High"
                            ? "text-red-400"
                            : event.severity === "Medium"
                              ? "text-yellow-400"
                              : "text-blue-400"
                        }`}
                      >
                        {event.event_type?.replace(/_/g, " ").toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500">
                        {event.timestamp}
                      </span>
                    </div>
                    <p className="text-gray-300 text-sm mt-1">
                      {event.details}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
