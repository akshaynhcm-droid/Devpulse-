"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

export default function AdminPage() {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAdminData = async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch(`${API_BASE}/admin/platform-stats`),
        fetch(`${API_BASE}/admin/users`),
      ]);
      setStats(await statsRes.json());
      setUsers((await usersRes.json()).users || []);
    } catch (err) {
      console.error("Failed to fetch admin data:", err);
    } finally {
      setLoading(false);
    }
  };

  const upgradeUser = async (email: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) fetchAdminData();
    } catch (err) {
      console.error("Failed to upgrade user:", err);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

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
          <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
            &larr; Dashboard
          </Link>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <div>
            <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <p className="text-sm text-gray-400 mb-1">Total Users</p>
                <p className="text-3xl font-bold">{stats?.total_users || 0}</p>
              </div>
              <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <p className="text-sm text-gray-400 mb-1">Pro Users</p>
                <p className="text-3xl font-bold">{stats?.pro_users || 0}</p>
              </div>
              <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <p className="text-sm text-gray-400 mb-1">Total Collections</p>
                <p className="text-3xl font-bold">
                  {stats?.total_collections || 0}
                </p>
              </div>
              <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <p className="text-sm text-gray-400 mb-1">System Health</p>
                <p
                  className={`text-3xl font-bold ${stats?.system_healthy ? "text-green-400" : "text-red-400"}`}
                >
                  {stats?.system_healthy ? "Healthy" : "Error"}
                </p>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-4">User Management</h2>
              {users.length === 0 ? (
                <p className="text-gray-500">No users found.</p>
              ) : (
                <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-700">
                      <tr>
                        <th className="text-left px-6 py-3 text-sm text-gray-400">
                          Email
                        </th>
                        <th className="text-left px-6 py-3 text-sm text-gray-400">
                          Plan
                        </th>
                        <th className="text-left px-6 py-3 text-sm text-gray-400">
                          Created
                        </th>
                        <th className="text-left px-6 py-3 text-sm text-gray-400">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user: any) => (
                        <tr key={user.id} className="border-t border-gray-700">
                          <td className="px-6 py-3">{user.email}</td>
                          <td className="px-6 py-3">
                            <span
                              className={`px-2 py-1 rounded text-sm ${
                                user.plan === "pro"
                                  ? "bg-blue-900/30 text-blue-400"
                                  : user.plan === "enterprise"
                                    ? "bg-purple-900/30 text-purple-400"
                                    : "bg-gray-700 text-gray-400"
                              }`}
                            >
                              {user.plan}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-400">
                            {user.created_at}
                          </td>
                          <td className="px-6 py-3">
                            {user.plan === "free" && (
                              <button
                                onClick={() => upgradeUser(user.email)}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
                              >
                                Upgrade
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
