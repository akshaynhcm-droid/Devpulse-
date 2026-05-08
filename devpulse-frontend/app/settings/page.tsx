"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";

type Tab = "profile" | "security" | "notifications" | "danger" | "audit";

// ============================================================================
// PROFILE TAB
// ============================================================================
function ProfileTab() {
  const { data: profile, refetch } = trpc.settings.getProfile.useQuery();
  const updateProfile = trpc.settings.updateProfile.useMutation({
    onSuccess: () => {
      refetch();
      setMessage({ type: "success", text: "Profile updated successfully" });
    },
    onError: (err: { message: string }) => {
      setMessage({ type: "error", text: err.message });
    },
  });

  const [name, setName] = useState(profile?.name || "");
  const [email, setEmail] = useState(profile?.email || "");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate({ name, email });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">
          Profile Information
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Update your display name and email address
        </p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-md ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Your name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="your@email.com"
          />
          <p className="text-xs text-gray-500 mt-1">
            Changing email will require verification
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Plan
          </label>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium capitalize">
              {profile?.plan}
            </span>
            <Link
              href="/pricing"
              className="text-sm text-blue-600 hover:underline"
            >
              Upgrade →
            </Link>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Role
          </label>
          <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-medium capitalize">
            {profile?.role}
          </span>
        </div>

        <button
          type="submit"
          disabled={updateProfile.isPending}
          className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {updateProfile.isPending ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}

// ============================================================================
// SECURITY TAB
// ============================================================================
function SecurityTab() {
  const { data: sessions, refetch: refetchSessions } =
    trpc.settings.getSessions.useQuery();
  const revokeSession = trpc.settings.revokeSession.useMutation({
    onSuccess: () => refetchSessions(),
  });
  const revokeAllSessions = trpc.settings.revokeAllSessions.useMutation({
    onSuccess: () => refetchSessions(),
  });
  const changePassword = trpc.settings.changePassword.useMutation({
    onSuccess: () => {
      setMessage({ type: "success", text: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: { message: string }) => {
      setMessage({ type: "error", text: err.message });
    },
  });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match" });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({
        type: "error",
        text: "Password must be at least 8 characters",
      });
      return;
    }
    changePassword.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="space-y-8">
      {/* Change Password */}
      <div>
        <h3 className="text-lg font-medium text-gray-900">Change Password</h3>
        <p className="text-sm text-gray-500 mt-1">Update your password</p>

        {message && (
          <div
            className={`mt-4 p-4 rounded-md ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={8}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={changePassword.isPending}
            className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {changePassword.isPending ? "Changing..." : "Change Password"}
          </button>
        </form>
      </div>

      {/* 2FA Section (Stub) */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900">
          Two-Factor Authentication
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Add an extra layer of security to your account
        </p>
        <div className="mt-4 p-4 bg-gray-50 rounded-md">
          <p className="text-sm text-gray-600">
            2FA setup coming soon. This will support authenticator apps like
            Google Authenticator and Authy.
          </p>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="border-t pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Active Sessions
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Manage your active sessions across devices
            </p>
          </div>
          <button
            onClick={() => revokeAllSessions.mutate()}
            disabled={revokeAllSessions.isPending}
            className="text-red-600 hover:text-red-700 text-sm font-medium"
          >
            {revokeAllSessions.isPending ? "Revoking..." : "Revoke All"}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {sessions?.sessions.length === 0 ? (
            <p className="text-sm text-gray-500">No active sessions</p>
          ) : (
            sessions?.sessions.map(
              (session: {
                id: string;
                userAgent?: string | null;
                ipAddress?: string | null;
                lastActiveAt: string | Date;
              }) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {session.userAgent?.includes("Mobile")
                        ? "Mobile Device"
                        : "Desktop"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {session.ipAddress || "Unknown IP"} • Last active{" "}
                      {new Date(session.lastActiveAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      revokeSession.mutate({ sessionId: session.id })
                    }
                    disabled={revokeSession.isPending}
                    className="text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Revoke
                  </button>
                </div>
              )
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// NOTIFICATIONS TAB
// ============================================================================
function NotificationsTab() {
  const utils = trpc.useUtils();
  const { data: prefs, isLoading } =
    trpc.settings.getEmailPreferences.useQuery();
  const updatePrefs = trpc.settings.updateEmailPreferences.useMutation({
    onSuccess: () => {
      utils.settings.getEmailPreferences.invalidate();
      setMessage({ type: "success", text: "Preferences saved" });
    },
    onError: (err: { message: string }) => {
      setMessage({ type: "error", text: err.message });
    },
  });
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const toggle = (
    key:
      | "scanComplete"
      | "budgetAlerts"
      | "weeklyDigest"
      | "teamActivity"
      | "promotionalEmails",
    value: boolean
  ) => {
    updatePrefs.mutate({ [key]: value });
  };

  const rows: {
    key:
      | "scanComplete"
      | "budgetAlerts"
      | "weeklyDigest"
      | "teamActivity"
      | "promotionalEmails";
    label: string;
    description: string;
  }[] = [
    {
      key: "scanComplete",
      label: "Scan completion",
      description: "Get notified when a scan finishes.",
    },
    {
      key: "budgetAlerts",
      label: "Budget alerts",
      description: "Warn me when token spend approaches my limit.",
    },
    {
      key: "weeklyDigest",
      label: "Weekly digest",
      description: "Send me a weekly summary of risk + cost trends.",
    },
    {
      key: "teamActivity",
      label: "Team activity",
      description: "Notify me when teammates run scans or trigger alerts.",
    },
    {
      key: "promotionalEmails",
      label: "Product updates",
      description: "Occasional emails about new DevPulse features.",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">
          Email Notifications
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Choose which emails you want to receive from DevPulse.
        </p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-md ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
        >
          {message.text}
        </div>
      )}

      {isLoading || !prefs ? (
        <p className="text-sm text-gray-500">Loading preferences…</p>
      ) : (
        <div className="space-y-3">
          {rows.map(row => {
            const checked = Boolean(
              prefs[row.key as keyof typeof prefs] as unknown as boolean
            );
            return (
              <label
                key={row.key}
                className="flex items-start justify-between p-3 rounded-md border border-gray-200 hover:bg-gray-50"
              >
                <span>
                  <span className="block text-sm font-medium text-gray-900">
                    {row.label}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {row.description}
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded text-blue-600"
                  checked={checked}
                  disabled={updatePrefs.isPending}
                  onChange={e => toggle(row.key, e.target.checked)}
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// AUDIT LOG TAB
// ============================================================================
function AuditTab() {
  const { data: auditLog } = trpc.settings.getAuditLog.useQuery({ limit: 50 });

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-medium text-gray-900">Activity</h3>
      <p className="text-sm text-gray-500">
        Recent security-related events on your account.
      </p>
      <div className="mt-4 space-y-2">
        {!auditLog?.logs || auditLog.logs.length === 0 ? (
          <p className="text-sm text-gray-500">No recent activity</p>
        ) : (
          auditLog.logs.map(
            (log: {
              id: string;
              action: string;
              ipAddress?: string | null;
              createdAt: string | Date;
            }) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-md text-sm"
              >
                <div>
                  <span className="font-medium text-gray-900">
                    {log.action
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                  </span>
                  {log.ipAddress && (
                    <span className="text-gray-500 ml-2">
                      from {log.ipAddress}
                    </span>
                  )}
                </div>
                <span className="text-gray-500">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}

// ============================================================================
// DANGER ZONE TAB
// ============================================================================
function DangerZoneTab() {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const router = useRouter();
  const { logout } = useAuth();

  const deleteAccount = trpc.settings.deleteAccount.useMutation({
    onSuccess: () => {
      logout();
      router.push("/");
    },
  });

  const { data: auditLog } = trpc.settings.getAuditLog.useQuery({ limit: 20 });

  return (
    <div className="space-y-8">
      {/* Security Audit Log */}
      <div>
        <h3 className="text-lg font-medium text-gray-900">
          Security Audit Log
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Recent security-related actions on your account
        </p>

        <div className="mt-4 space-y-2">
          {auditLog?.logs.length === 0 ? (
            <p className="text-sm text-gray-500">No recent activity</p>
          ) : (
            auditLog?.logs.map(
              (log: {
                id: string;
                action: string;
                ipAddress?: string | null;
                createdAt: string | Date;
              }) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-md text-sm"
                >
                  <div>
                    <span className="font-medium text-gray-900">
                      {log.action
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                    </span>
                    {log.ipAddress && (
                      <span className="text-gray-500 ml-2">
                        from {log.ipAddress}
                      </span>
                    )}
                  </div>
                  <span className="text-gray-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
              )
            )
          )}
        </div>
      </div>

      {/* Delete Account */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-red-600">Delete Account</h3>
        <p className="text-sm text-gray-500 mt-1">
          Permanently delete your account and all associated data. This action
          cannot be undone.
        </p>

        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">This will delete:</p>
          <ul className="text-sm text-red-700 mt-2 ml-4 list-disc">
            <li>Your profile and authentication data</li>
            <li>All collections and imported APIs</li>
            <li>All scan history and findings</li>
            <li>Team memberships and invitations</li>
            <li>Token usage history and billing records</li>
            <li>Kill switch settings and events</li>
          </ul>
        </div>

        <button
          onClick={() => setShowDeleteModal(true)}
          className="mt-4 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700"
        >
          Delete Account
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Delete Your Account?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              This action cannot be undone. All your data will be permanently
              removed.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason for leaving (optional)
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Help us improve..."
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type &quot;DELETE MY ACCOUNT&quot; to confirm
              </label>
              <input
                type="text"
                value={confirmation}
                onChange={e => setConfirmation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="DELETE MY ACCOUNT"
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  deleteAccount.mutate({
                    confirmation: confirmation as "DELETE MY ACCOUNT",
                    reason,
                  })
                }
                disabled={
                  confirmation !== "DELETE MY ACCOUNT" ||
                  deleteAccount.isPending
                }
                className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {deleteAccount.isPending ? "Deleting..." : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN SETTINGS PAGE
// ============================================================================
function SettingsContent() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const { user } = useAuth();

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "profile", label: "Profile", icon: "👤" },
    { id: "security", label: "Security", icon: "🔒" },
    { id: "notifications", label: "Notifications", icon: "🔔" },
    { id: "danger", label: "Danger Zone", icon: "⚠️" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
              <p className="text-sm text-gray-500">
                Manage your account preferences and security
              </p>
            </div>
            <Link
              href="/dashboard"
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <div className="w-full md:w-64 flex-shrink-0">
            <nav className="space-y-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-md text-left transition-colors ${
                    activeTab === tab.id
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-700 hover:bg-gray-100"
                  } ${tab.id === "danger" ? "text-red-600 hover:bg-red-50" : ""}`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1">
            <div className="bg-white rounded-lg shadow p-6">
              {activeTab === "profile" && <ProfileTab />}
              {activeTab === "security" && <SecurityTab />}
              {activeTab === "notifications" && <NotificationsTab />}
              {activeTab === "danger" && <DangerZoneTab />}
              {activeTab === "audit" && <AuditTab />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
