"use client";
import { useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { trpc } from "@/lib/trpc";

type CollectionFormat = "postman" | "openapi";

export default function CollectionsPage() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.collections.list.useQuery();
  const collections = data?.collections ?? [];

  const [showUpload, setShowUpload] = useState(false);
  const [uploadData, setUploadData] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadFormat, setUploadFormat] = useState<CollectionFormat>("postman");
  const [error, setError] = useState<string | null>(null);

  const createCollection = trpc.collections.create.useMutation({
    onSuccess: () => {
      utils.collections.list.invalidate();
      setShowUpload(false);
      setUploadData("");
      setUploadName("");
      setError(null);
    },
    onError: (err: { message: string }) => setError(err.message),
  });

  const deleteCollection = trpc.collections.delete.useMutation({
    onSuccess: () => utils.collections.list.invalidate(),
    onError: (err: { message: string }) => setError(err.message),
  });

  const handleUpload = () => {
    if (!uploadName.trim() || !uploadData.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(uploadData);
    } catch {
      setError("Collection data must be valid JSON.");
      return;
    }
    createCollection.mutate({
      name: uploadName,
      format: uploadFormat,
      data: parsed,
    });
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Delete this collection? This cannot be undone.")) {
      return;
    }
    deleteCollection.mutate({ id });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-400">Collections</h1>
            <p className="text-gray-400 mt-1">Manage your API collections</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded bg-red-900/40 border border-red-500/50 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end mb-6">
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
                  onChange={e =>
                    setUploadFormat(e.target.value as CollectionFormat)
                  }
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
                  disabled={createCollection.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {createCollection.isPending ? "Importing…" : "Import"}
                </button>
                <button
                  onClick={() => {
                    setShowUpload(false);
                    setError(null);
                  }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {isLoading ? (
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
                    <span>{col.totalRequests} requests</span>
                    <span>{new Date(col.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/scanning?collection=${col.id}`}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors text-sm"
                  >
                    Scan
                  </Link>
                  <button
                    onClick={() => handleDelete(col.id)}
                    disabled={deleteCollection.isPending}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
