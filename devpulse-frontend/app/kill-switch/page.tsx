"use client";
import { useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

export default function KillSwitchPage() {
  const [status, setStatus] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [budgetInput, setBudgetInput] = useState("");
  const [triggerReason, setTriggerReason] = useState("");
  const [resetReason, setResetReason] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const [statusRes, logsRes] = await Promise.all([
        fetch(`${API_BASE}/kill-switch/status`),
        fetch(`${API_BASE}/kill-switch/logs`)
      ]);
      setStatus(await statusRes.json());
      setLogs((await logsRes.json()).logs || []);
    } catch (err) {
      console.error("Failed to fetch kill switch status:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSetBudget = async () => {
    if (!budgetInput.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/kill-switch/budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthly_limit: parseFloat(budgetInput) }),
      });
      if (res.ok) {
        setBudgetInput("");
        fetchStatus();
      }
    } catch (err) {
      console.error("Failed to set budget:", err);
    }
  };

  const handleTrigger = async () => {
    if (!triggerReason.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/kill-switch/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: triggerReason }),
      });
      if (res.ok) {
        setTriggerReason("");
        fetchStatus();
      }
    } catch (err) {
      console.error("Failed to trigger kill switch:", err);
    }
  };

  const handleReset = async () => {
    if (!resetReason.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/kill-switch/reset`, {
        method: "POST",
        headers: { Content-Type: application/json },
        body: JSON.stringify({ reason: resetReason }),
      });
      if (res.ok) {
        setResetReason("");
        fetchStatus();
      }
    } catch (err) {
      console.error("Failed to reset kill switch:", err);
    }
  };

  useState(() => {
    fetchStatus();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-400">Kill Switch</h1>
            <p className="text-gray-400 mt-1">Budget management and LLM operation control</p>
          </div>
          <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
            &larr; Dashboard
          </Link>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <h2 className="text-xl font-semibold mb-4">Budget Configuration</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Monthly Budget Limit ($)</label>
                    <input
                      type="number"
                      value={budgetInput}
                      onChange={(e) => setBudgetInput(e.target.value)}
                      placeholder="1000.00"
                      className="w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <button
                    onClick={handleSetBudget}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
                  >
                    Set Budget
                  </button>
                </div>
              </div>

              <div className={`p-6 rounded-lg border ${status?.status?.is_active ? "bg-red-900/30 border-red-500" : "bg-gray-800 border-gray-700"}`}>
                <h2 className="text-xl font-semibold mb-4">Status</h2>
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-3 h-3 rounded-full ${status?.status?.is_active ? "bg-red-500" : "bg-green-500"}`}></div>
                  <span className="text-lg font-bold">
                    {status?.status?.is_active ? "ACTIVE" : "INACTIVE"}
                  </span>
                </div>
                {status?.status?.is_active && status?.status?.last_reason && (
                  <p className="text-gray-300 text-sm">Reason: {status.status.last_reason}</p>
                )}
                {status?.budget && (
                  <div className="text-sm text-gray-400 mt-2">
                    Budget: ${status.budget.monthly_limit.toFixed(2)}/mo
                  </div>
                )}
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Kill Switch Actions</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Trigger Kill Switch</label>
                  <textarea
                    value={triggerReason}
                    onChange={(e) => setTriggerReason(e.target.value)}
                    placeholder="Describe why you are triggering the kill switch..."
                    className="w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
                    rows={3}
                  />
                  <button
                    onClick={handleTrigger}
                    className="mt-2 w-full py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
                  >
                    Trigger Now
                  </button>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Reset Kill Switch</label>
                  <textarea
                    value={resetReason}
                    onChange={(e) => setResetReason(e.target.value)}
                    placeholder="Describe why you are resetting the kill switch..."
                    className="w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
                    rows={3}
                  />
                  <button
                    onClick={handleReset}
                    className="mt-2 w-full py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-4">Audit Trail</h2>
              {logs.length === 0 ? (
                <p className="text-gray-500">No kill switch events yet.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {logs.map((log: any) => (
                    <div key={log.id} className="bg-gray-800 p-3 rounded-lg border border-gray-700">
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-sm font-bold ${
                          log.action === "triggered" ? "text-red-400" :
                          log.action === "reset" ? "text-green-400" : "text-blue-400"
                        }`}>
                          {log.action.toUpperCase()}
                        </span>
                        <span className="text-xs text-gray-500">{log.created_at}</span>
                      </div>
                      <p className="text-sm text-gray-300">{log.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
