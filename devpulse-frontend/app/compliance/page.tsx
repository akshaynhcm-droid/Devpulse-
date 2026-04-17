"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

export default function CompliancePage() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFramework, setSelectedFramework] = useState("pci_dss");
  const [selectedCollection, setSelectedCollection] = useState("");
  const [collections, setCollections] = useState<any[]>([]);

  const fetchCollections = async () => {
    try {
      const res = await fetch(`${API_BASE}/collections`);
      const json = await res.json();
      setCollections(json.collections || []);
    } catch (err) {
      console.error("Failed to fetch collections:", err);
    }
  };

  const fetchReports = async () => {
    try {
      const res = await fetch(`${API_BASE}/compliance/`);
      const json = await res.json();
      setReports(json.reports || []);
    } catch (err) {
      console.error("Failed to fetch reports:", err);
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    try {
      const res = await fetch(`${API_BASE}/compliance/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          framework: selectedFramework,
          collection_id: selectedCollection || undefined,
        }),
      });
      if (res.ok) fetchReports();
    } catch (err) {
      console.error("Failed to generate report:", err);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, []);

  useEffect(() => {
    fetchReports();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-400">
              Compliance Reports
            </h1>
            <p className="text-gray-400 mt-1">
              PCI DSS and OWASP compliance assessment
            </p>
          </div>
          <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
            &larr; Dashboard
          </Link>
        </div>

        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Compliance Framework
            </label>
            <select
              value={selectedFramework}
              onChange={e => setSelectedFramework(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="pci_dss">PCI DSS</option>
              <option value="owasp_top_10">OWASP Top 10</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Select Collection (Optional)
            </label>
            <select
              value={selectedCollection}
              onChange={e => setSelectedCollection(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">-- Select All Collections --</option>
              {collections.map(col => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={generateReport}
          className="mb-8 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
        >
          Generate New Report
        </button>

        {loading ? (
          <p className="text-gray-400">Loading reports...</p>
        ) : reports.length === 0 ? (
          <EmptyState
            icon={<span>📋</span>}
            title="No compliance reports yet"
            description="Generate a PCI DSS or OWASP Top 10 report to see how each framework scores your APIs."
            actions={[
              {
                label: "Generate report",
                onClick: generateReport,
              },
              {
                label: "Import a collection",
                href: "/collections",
                variant: "secondary",
              },
            ]}
          />
        ) : (
          <div className="space-y-3">
            {reports.map((report: any) => (
              <div
                key={report.id}
                className="bg-gray-800 p-6 rounded-lg border border-gray-700"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {report.framework}
                    </h3>
                    <p className="text-sm text-gray-400">
                      {report.id} - {report.created_at}
                    </p>
                  </div>
                  <div>
                    <p className="text-4xl font-bold">{report.score}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-400">
                    {report.total_requirements} requirements
                  </p>
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    <span>{report.met_count} met</span>
                    <span>{report.not_met_count} not met</span>
                    <span>{report.manual_review_count} manual review</span>
                  </div>
                </div>
                <div>
                  <button
                    onClick={fetchReports}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium transition-colors"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
