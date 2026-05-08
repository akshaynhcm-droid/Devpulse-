"use client";

import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");

  const auditQuery = trpc.settings.getAuditLog.useQuery({ limit: 100 });

  const filteredLogs = useMemo(() => {
    const all = auditQuery.data?.logs ?? [];
    if (!filter) return all;
    return all.filter(l => l.action === filter);
  }, [auditQuery.data, filter]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const pagedLogs = filteredLogs.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );
  const loading = auditQuery.isLoading;

  const formatDate = (dateStr: string | Date) => {
    return new Date(dateStr).toLocaleString();
  };

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      user_login: "bg-green-100 text-green-800",
      user_logout: "bg-gray-100 text-gray-800",
      collection_created: "bg-blue-100 text-blue-800",
      collection_deleted: "bg-red-100 text-red-800",
      scan_triggered: "bg-purple-100 text-purple-800",
      kill_switch_triggered: "bg-red-200 text-red-900",
      team_invite_sent: "bg-yellow-100 text-yellow-800",
      plan_upgraded: "bg-green-200 text-green-900",
    };
    return colors[action] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Audit Log</h1>

      <div className="mb-4 flex gap-4">
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="">All Actions</option>
          <option value="user_login">User Login</option>
          <option value="collection_created">Collection Created</option>
          <option value="collection_deleted">Collection Deleted</option>
          <option value="scan_triggered">Scan Triggered</option>
          <option value="kill_switch_triggered">Kill Switch</option>
        </select>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <table className="w-full border-collapse border">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Time</th>
                <th className="border p-2 text-left">Action</th>
                <th className="border p-2 text-left">Resource</th>
                <th className="border p-2 text-left">Details</th>
                <th className="border p-2 text-left">IP Address</th>
              </tr>
            </thead>
            <tbody>
              {pagedLogs.map(log => (
                <tr key={log.id} data-testid={`audit-entry-${log.action}`}>
                  <td className="border p-2">{formatDate(log.createdAt)}</td>
                  <td className="border p-2">
                    <span
                      className={`px-2 py-1 rounded text-sm ${getActionColor(
                        log.action
                      )}`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="border p-2">
                    {log.details ? (
                      <pre className="text-xs">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="border p-2">{log.ipAddress || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-between items-center">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
