"use client";
import { useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

export default function CollectionsPage() {
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadData, setUploadData] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadFormat, setUploadFormat] = useState("postman");

  const fetchCollections = async () => {
    try {
      const res = await fetch(`${API_BASE}/collections`);
      const json = await res.json();
      setCollections(json.collections || []);
    } catch (err) {
      console.error("Failed to fetch collections:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadName.trim() || !uploadData.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: uploadName,
          format: uploadFormat,
          data: uploadData,
        }),
      });
      if (res.ok) {
        setShowUpload(false);
        setUploadData("");
        setUploadName("");
        fetchCollections();
      }
    } catch (err) {
      console.error("Upload failed:", err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/collections/${id}`, {
        method: "DELETE",
      });
      if (res.ok) fetchCollections();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  useState(() => {
    fetchCollections();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-400">Collections</h1>
            <p className="text-gray-400 mt-1">Manage your API collections</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setShowUpload(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
            >
              Import Collection
            </button>
            <Link
              href="/dashboard"
              className="text-blue-400 hover:text-blue-300"
            >
              &larr; Dashboard
            </Link>
          </div>
        </div>

        {showUpload && (
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 mb-8">
            <h2 className="text-xl font-semibold mb-4">Import Collection</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Collection Name
                </label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={e => setUploadName(e.target.value)}
                  placeholder="My API Collection"
                  className="w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Format
                </label>
                <select
                  value={uploadFormat}
                  onChange={e => setUploadFormat(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="postman">Postman</option>
                  <option value="openapi">OpenAPI</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Collection Data (JSON)
                </label>
                <textarea
                  value={uploadData}
                  onChange={e => setUploadData(e.target.value)}
                  placeholder='{"info": {"name": "My API", "schema": "..."}}'
                  className="w-full h-40 px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                />
              </div>
              <div className="flex gap-4">
                <button
                  onClick={handleUpload}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
                >
                  Import
                </button>
                <button
                  onClick={() => setShowUpload(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {loading ? (
            <p className="text-gray-400">Loading collections...</p>
          ) : collections.length === 0 ? (
            <EmptyState
              icon={<span>📚</span>}
              title="No collections yet"
              description="Import a Postman or OpenAPI collection to start scanning your APIs for security issues and shadow endpoints."
              actions={[
                {
                  label: "Import Collection",
                  onClick: () => setShowUpload(true),
                },
                {
                  label: "View documentation",
                  href: "/onboarding",
                  variant: "secondary",
                },
              ]}
            />
          ) : (
            collections.map(col => (
              <div
                key={col.id}
                className="bg-gray-800 p-6 rounded-lg border border-gray-700 flex justify-between items-center"
              >
                <div>
                  <h3 className="text-lg font-semibold">{col.name}</h3>
                  <p className="text-gray-400 text-sm">
                    {col.description || "No description"}
                  </p>
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    <span>{col.format}</span>
                    <span>{col.total_requests} requests</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(col.id)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
