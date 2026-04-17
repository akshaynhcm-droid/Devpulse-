"use client";
import { useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

export default function ShadowAPIsPage() {
  const [shadowAPIs, setShadowAPIs] = useState<any[]>([]);
  const [selectedCollection, setSelectedCollection] = useState("");
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCollections = async () => {
    try {
      const res = await fetch(`${API_BASE}/collections`);
      const json = await res.json();
      setCollections(json.collections || []);
    } catch (err) {
      console.error("Failed to fetch collections:", err);
    }
  };

  const fetchShadowAPIs = async () => {
    if (!selectedCollection) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/shadow-apis/collection/${selectedCollection}`
      );
      const json = await res.json();
      setShadowAPIs(json.shadow_apis || []);
    } catch (err) {
      console.error("Failed to fetch shadow APIs:", err);
    } finally {
      setLoading(false);
    }
  };

  const markAsDocumented = async (apiId: string) => {
    try {
      const res = await fetch(`${API_BASE}/shadow-apis/${apiId}/document`, {
        method: "PATCH",
      });
      if (res.ok) fetchShadowAPIs();
    } catch (err) {
      console.error("Failed to mark as documented:", err);
    }
  };

  useState(() => {
    fetchCollections();
  }, []);

  const handleCollectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCollection(e.target.value);
    fetchShadowAPIs();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-400">Shadow APIs</h1>
            <p className="text-gray-400 mt-1">
              Detect undocumented endpoints in your collections
            </p>
          </div>
          <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
            &larr; Dashboard
          </Link>
        </div>

        <div className="mb-8">
          <label className="block text-sm text-gray-400 mb-1">
            Select Collection
          </label>
          <select
            value={selectedCollection}
            onChange={handleCollectionChange}
            className="w-full max-w-md px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">-- Select a collection --</option>
            {collections.map(col => (
              <option key={col.id} value={col.id}>
                {col.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          {loading ? (
            <p className="text-gray-400">Loading...</p>
          ) : !selectedCollection ? (
            <EmptyState
              icon={<span>🔎</span>}
              title="Pick a collection"
              description="Shadow-API detection compares your production traffic against the endpoints defined in each collection. Select one above to get started."
              actions={[
                {
                  label: "Import a collection",
                  href: "/collections",
                },
              ]}
            />
          ) : shadowAPIs.length === 0 ? (
            <EmptyState
              icon={<span>✅</span>}
              title="No shadow APIs found"
              description="Every endpoint seen in traffic is documented in this collection. Nice work."
              actions={[
                {
                  label: "Run another scan",
                  href: "/scanning",
                  variant: "secondary",
                },
              ]}
            />
          ) : (
            shadowAPIs.map(api => (
              <div
                key={api.id}
                className={`p-4 rounded-lg border ${
                  api.is_documented
                    ? "bg-gray-800 border-gray-700"
                    : api.risk_level === "High"
                      ? "bg-red-900/30 border-red-500"
                      : "bg-yellow-900/30 border-yellow-500"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-bold text-sm ${
                          api.risk_level === "High"
                            ? "text-red-400"
                            : "text-yellow-400"
                        }`}
                      >
                        {api.risk_level.toUpperCase()}
                      </span>
                      <span className="text-gray-400 text-xs">
                        {api.method}
                      </span>
                    </div>
                    <p className="text-sm mt-1 text-gray-300">{api.endpoint}</p>
                    <p className="text-xs text-gray-500 mt-1">{api.reason}</p>
                  </div>
                  {!api.is_documented && (
                    <button
                      onClick={() => markAsDocumented(api.id)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
                    >
                      Mark Documented
                    </button>
                  )}
                  {api.is_documented && (
                    <span className="px-3 py-1 bg-gray-700 rounded text-sm text-gray-400">
                      Documented
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
