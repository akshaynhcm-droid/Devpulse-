"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { AdminSignupChart, AdminPlanMixChart } from "@/components/AdminCharts";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

interface AdminUser {
  id: number;
  email: string;
  plan: string;
  created_at?: string;
  name?: string;
}

interface PlatformStats {
  total_users?: number;
  pro_users?: number;
  total_collections?: number;
  system_healthy?: boolean;
}

const PLAN_BADGE: Record<string, string> = {
  free: "bg-gray-700 text-gray-300",
  pro: "bg-blue-900/40 text-blue-300 border border-blue-700/60",
  enterprise: "bg-purple-900/40 text-purple-300 border border-purple-700/60",
};

function formatDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  const fetchAdminData = async () => {
    setError(null);
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch(`${API_BASE}/admin/platform-stats`),
        fetch(`${API_BASE}/admin/users`),
      ]);
      if (!statsRes.ok || !usersRes.ok) {
        throw new Error(`HTTP ${statsRes.status} / ${usersRes.status}`);
      }
      setStats(await statsRes.json());
      setUsers((await usersRes.json()).users || []);
    } catch (err) {
      console.error("Failed to fetch admin data:", err);
      setError(
        "Could not load admin data. Check that you have admin privileges and the backend is reachable."
      );
    } finally {
      setLoading(false);
    }
  };

  const upgradeUser = async (email: string) => {
    setBusyEmail(email);
    try {
      const res = await fetch(`${API_BASE}/admin/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        await fetchAdminData();
      }
    } catch (err) {
      console.error("Failed to upgrade user:", err);
    } finally {
      setBusyEmail(null);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter(u => {
      if (planFilter !== "all" && u.plan !== planFilter) return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        (u.name || "").toLowerCase().includes(q)
      );
    });
  }, [users, query, planFilter]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-400">
              Admin Dashboard
            </h1>
            <p className="text-gray-400 mt-1">
              Platform administration and user management
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setLoading(true);
                fetchAdminData();
              }}
              className="px-3 py-2 text-sm rounded-md border border-gray-700 text-gray-200 hover:bg-gray-800 transition-colors"
            >
              Refresh
            </button>
            <Link
              href="/dashboard"
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              &larr; Dashboard
            </Link>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-md border border-red-700/60 bg-red-900/20 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <div>
            <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <p className="text-sm text-gray-400 mb-1">Total Users</p>
                <p className="text-3xl font-bold">{stats?.total_users ?? 0}</p>
                <p className="text-xs text-gray-500 mt-2">
                  {filteredUsers.length} currently visible
                </p>
              </div>
              <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <p className="text-sm text-gray-400 mb-1">Pro Users</p>
                <p className="text-3xl font-bold text-blue-300">
                  {stats?.pro_users ?? 0}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {stats?.total_users
                    ? `${Math.round(
                        ((stats.pro_users || 0) / stats.total_users) * 100
                      )}% conversion`
                    : "0% conversion"}
                </p>
              </div>
              <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <p className="text-sm text-gray-400 mb-1">Total Collections</p>
                <p className="text-3xl font-bold">
                  {stats?.total_collections ?? 0}
                </p>
                <p className="text-xs text-gray-500 mt-2">across all tenants</p>
              </div>
              <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <p className="text-sm text-gray-400 mb-1">System Health</p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      stats?.system_healthy ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  <p
                    className={`text-2xl font-bold ${
                      stats?.system_healthy ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {stats?.system_healthy ? "Healthy" : "Degraded"}
                  </p>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  API + DB + queue heartbeat
                </p>
              </div>
            </div>

            <div className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-gray-800 p-6 rounded-lg border border-gray-700">
                <h2 className="text-sm text-gray-400 mb-3">
                  Signups (last 30 days)
                </h2>
                <AdminSignupChart users={users} />
              </div>
              <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <h2 className="text-sm text-gray-400 mb-3">Plan mix</h2>
                <AdminPlanMixChart users={users} />
              </div>
            </div>

            <div>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <h2 className="text-xl font-semibold">User Management</h2>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search email or name…"
                    className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={planFilter}
                    onChange={e => setPlanFilter(e.target.value)}
                    className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All plans</option>
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
              </div>

              {filteredUsers.length === 0 ? (
                <EmptyState
                  icon={<span>👤</span>}
                  title={
                    users.length === 0 ? "No users yet" : "No matching users"
                  }
                  description={
                    users.length === 0
                      ? "As people sign up they'll appear here with their plan, creation date, and upgrade actions."
                      : "Try a different search or plan filter."
                  }
                  actions={
                    users.length === 0
                      ? undefined
                      : [
                          {
                            label: "Clear filters",
                            onClick: () => {
                              setQuery("");
                              setPlanFilter("all");
                            },
                            variant: "secondary",
                          },
                        ]
                  }
                />
              ) : (
                <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-700/60">
                      <tr>
                        <th className="text-left px-6 py-3 text-xs uppercase tracking-wide text-gray-400">
                          User
                        </th>
                        <th className="text-left px-6 py-3 text-xs uppercase tracking-wide text-gray-400">
                          Plan
                        </th>
                        <th className="text-left px-6 py-3 text-xs uppercase tracking-wide text-gray-400">
                          Joined
                        </th>
                        <th className="text-right px-6 py-3 text-xs uppercase tracking-wide text-gray-400">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map(user => (
                        <tr
                          key={user.id}
                          className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors"
                        >
                          <td className="px-6 py-3">
                            <div className="flex flex-col">
                              <span className="text-gray-100">
                                {user.email}
                              </span>
                              {user.name && (
                                <span className="text-xs text-gray-500">
                                  {user.name}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide ${
                                PLAN_BADGE[user.plan] || PLAN_BADGE.free
                              }`}
                            >
                              {user.plan}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-400">
                            {formatDate(user.created_at)}
                          </td>
                          <td className="px-6 py-3 text-right">
                            {user.plan === "free" && (
                              <button
                                onClick={() => upgradeUser(user.email)}
                                disabled={busyEmail === user.email}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-sm font-medium transition-colors"
                              >
                                {busyEmail === user.email
                                  ? "Upgrading…"
                                  : "Upgrade to Pro"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
