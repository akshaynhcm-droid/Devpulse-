"use client";
import { useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

export default function ScanningPage() {
  const [code, setCode] = useState("");
  const [findings, setFindings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);

  const handleScan = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/security/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      setFindings(data.findings || []);
      setScanned(true);
    } catch (err) {
      console.error("Scan failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const severityColor = (s: string) => {
    switch (s) {
      case "hardcoded_secret": return "text-red-400 bg-red-900/30 border-red-500";
      case "shadow_api": return "text-yellow-400 bg-yellow-900/30 border-yellow-500";
      default: return "text-orange-400 bg-orange-900/30 border-orange-500";
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-400">Security Scanner</h1>
            <p className="text-gray-400 mt-1">Scan code for vulnerabilities and shadow APIs</p>
          </div>
          <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
            &larr; Back to Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
              <h2 className="text-xl font-semibold mb-4">Paste Code to Scan</h2>
              <textarea
                value={code}
                onChange={e => setCode(e.target.value)}
                className="w-full h-80 bg-gray-700 text-gray-200 p-4 rounded-lg border border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                placeholder="Paste your code here..."
              />
              <button
                onClick={handleScan}
                disabled={loading || !code.trim()}
                className="mt-4 w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-medium transition-colors"
              >
                {loading ? "Scanning..." : "Run Security Scan"}
              </button>
            </div>
          </div>

          <div>
            <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
              <h2 className="text-xl font-semibold mb-4">
                Findings ({findings.length})
              </h2>
              {!scanned ? (
                <p className="text-gray-500 text-center py-12">
                  Run a scan to see results here
                </p>
              ) : findings.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-green-400 text-lg font-bold">No Issues Found</p>
                  <p className="text-gray-400 mt-2">Your code looks clean!</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {findings.map((f, i) => (
                    <div
                      key={i}
                      className={`p-4 rounded-lg border ${severityColor(f.type)}`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold">{f.type?.replace(/_/g, " ").toUpperCase()}</span>
                        <span className="text-xs opacity-75">{f.key || f.url || ""}</span>
                      </div>
                      <p className="text-sm mt-2 opacity-80">{f.reason || f.match || ""}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
