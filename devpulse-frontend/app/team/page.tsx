"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

export default function TeamPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");

  const fetchMembers = async () => {
    try {
      const res = await fetch(`${API_BASE}/team/`);
      const json = await res.json();
      setMembers(json.members || []);
    } catch (err) {
      console.error("Failed to fetch team:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/team/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (res.ok) {
        setInviteEmail("");
        fetchMembers();
      }
    } catch (err) {
      console.error("Failed to invite:", err);
    }
  };

  const handleRemove = async (memberId: string) => {
    try {
      const res = await fetch(`${API_BASE}/team/${memberId}`, { method: "DELETE" });
      if (res.ok) fetchMembers();
    } catch (err) {
      console.error("Failed to remove:", err);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-blue-400">Team</h1>
            <p className="text-gray-400 mt-1">Manage team members and roles</p>
          </div>
          <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
            &larr; Dashboard
          </Link>
        </div>

        <div className="mb-8 bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h2 className="text-xl font-semibold mb-4">Invite Team Member</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              onClick={handleInvite}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
            >
              Send Invite
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Team Members</h2>
          {loading ? (
            <p className="text-gray-400">Loading...</p>
          ) : members.length === 0 ? (
            <p className="text-gray-500 text-center py-12">No team members yet.</p>
          ) : (
            <div className="space-y-3">
              {members.map((member: any) => (
                <div key={member.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{member.email}</p>
                    <div className="flex gap-4 mt-1 text-sm">
                      <span className={`px-2 py-1 rounded ${
                        member.role === "admin" ? "bg-purple-900/30 text-purple-400" :
                        member.role === "editor" ? "bg-blue-900/30 text-blue-400" :
                        "bg-gray-700 text-gray-400"
                      }`}>
                        {member.role.toUpperCase()}
                      </span>
                      <span className={`px-2 py-1 rounded ${
                        member.status === "active" ? "bg-green-900/30 text-green-400" :
                        member.status === "pending" ? "bg-yellow-900/30 text-yellow-400" :
                        "bg-gray-700 text-gray-400"
                      }`}>
                        {member.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(member.id)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
