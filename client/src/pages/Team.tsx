import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users,
  Trash2,
  UserPlus,
  Shield,
  Edit2,
  Mail,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

type Role = "admin" | "editor" | "viewer";

const roleColors: Record<Role, string> = {
  admin: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  editor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  viewer:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

const roleDescriptions: Record<Role, string> = {
  admin: "Full access to all features and settings",
  editor: "Can manage collections, run scans, and view reports",
  viewer: "Read-only access to collections and reports",
};

export default function Team() {
  const [inviteEmail, setInviteEmail] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role>("editor");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<Role>("editor");
  const [removeDialogId, setRemoveDialogId] = useState<string | null>(null);
  const [removeDialogEmail, setRemoveDialogEmail] = useState<string>("");

  const { data: team, refetch } = trpc.team.list.useQuery();
  const { data: pendingInvites } = trpc.team.getPendingInvitations.useQuery();
  const inviteMutation = trpc.team.invite.useMutation();
  const updateRoleMutation = trpc.team.updateRole.useMutation();
  const removeMutation = trpc.team.remove.useMutation();
  const resendInviteMutation = trpc.team.resendInvite.useMutation();
  const acceptMutation = trpc.team.acceptInvitation.useMutation();
  const rejectMutation = trpc.team.rejectInvitation.useMutation();

  const handleInvite = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!inviteEmail || !emailRegex.test(inviteEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    try {
      await inviteMutation.mutateAsync({
        email: inviteEmail,
        role: selectedRole,
      });
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      refetch();
    } catch (error: any) {
      toast.error(
        error?.message?.includes("already")
          ? "An invitation was already sent to this email."
          : "Failed to send invitation"
      );
    }
  };

  const handleUpdateRole = async (memberId: string) => {
    try {
      await updateRoleMutation.mutateAsync({ memberId, role: editingRole });
      toast.success("Role updated successfully");
      setEditingMemberId(null);
      refetch();
    } catch {
      toast.error("Failed to update role");
    }
  };

  const handleRemove = async () => {
    if (!removeDialogId) return;
    try {
      await removeMutation.mutateAsync({ memberId: removeDialogId });
      toast.success("Team member removed");
      setRemoveDialogId(null);
      setRemoveDialogEmail("");
      refetch();
    } catch {
      toast.error("Failed to remove team member");
    }
  };

  const handleResendInvite = async (memberId: string, email: string) => {
    try {
      await resendInviteMutation.mutateAsync({ memberId });
      toast.success(`Invitation resent to ${email}`);
    } catch {
      toast.error("Failed to resend invitation");
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Team Management</h1>
        <p className="text-muted-foreground">
          Invite team members and manage their access levels
        </p>
      </div>

      {/* Invite Section */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          Invite Team Member
        </h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Email Address
            </label>
            <Input
              type="email"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              disabled={inviteMutation.isPending}
              onKeyDown={e => e.key === "Enter" && handleInvite()}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Role
            </label>
            <div className="space-y-2">
              {(["admin", "editor", "viewer"] as Role[]).map(role => (
                <label
                  key={role}
                  className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  <input
                    type="radio"
                    value={role}
                    checked={selectedRole === role}
                    onChange={e => setSelectedRole(e.target.value as Role)}
                    disabled={inviteMutation.isPending}
                    className="w-4 h-4 mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-foreground capitalize">
                      {role}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {roleDescriptions[role]}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <Button
            onClick={handleInvite}
            disabled={inviteMutation.isPending}
            className="w-full"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
          </Button>
        </div>
      </Card>

      {/* Team Members List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-foreground">
            Team Members ({team?.total || 0})
          </h2>
        </div>

        {team?.members && team.members.length > 0 ? (
          <div className="space-y-2">
            {team.members.map(member => (
              <Card
                key={member.id}
                className="p-4 flex items-center justify-between hover:shadow-md transition-shadow"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">
                      {member.email}
                    </p>
                    {member.status === "pending" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                        Pending
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {editingMemberId === member.id ? (
                      <select
                        value={editingRole}
                        onChange={e => setEditingRole(e.target.value as Role)}
                        className="text-xs px-2 py-1 rounded border border-border bg-background text-foreground"
                      >
                        {(["admin", "editor", "viewer"] as Role[]).map(role => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${roleColors[member.role as Role] || ""}`}
                      >
                        <Shield className="w-3 h-3 mr-1" />
                        {member.role}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {editingMemberId === member.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateRole(member.id)}
                        disabled={updateRoleMutation.isPending}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingMemberId(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      {member.status === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            handleResendInvite(member.id, member.email)
                          }
                          disabled={resendInviteMutation.isPending}
                          title="Resend invitation email"
                        >
                          <Mail className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingMemberId(member.id);
                          setEditingRole(member.role as Role);
                        }}
                        title="Edit role"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRemoveDialogId(member.id);
                          setRemoveDialogEmail(member.email);
                        }}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="Remove member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              No team members yet. Invite someone to get started.
            </p>
          </Card>
        )}
      </div>

      {/* Role Information */}
      {/* Pending Invitations for Current User */}
      {pendingInvites && pendingInvites.invitations.length > 0 && (
        <Card className="p-6 space-y-4 border-blue-500/30 bg-blue-50/50 dark:bg-blue-900/10">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Pending Invitations
          </h3>
          <div className="space-y-3">
            {pendingInvites.invitations.map((inv: any) => (
              <div
                key={inv.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-background"
              >
                <div>
                  <p className="text-sm font-medium">
                    Invited as{" "}
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${roleColors[inv.role as Role]}`}
                    >
                      {inv.role}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Received {new Date(inv.invitedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await acceptMutation.mutateAsync({ memberId: inv.id });
                        toast.success("Invitation accepted!");
                        refetch();
                      } catch (err: any) {
                        toast.error(
                          err.message || "Failed to accept invitation"
                        );
                      }
                    }}
                    disabled={acceptMutation.isPending}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={async () => {
                      try {
                        await rejectMutation.mutateAsync({ memberId: inv.id });
                        toast.success("Invitation rejected");
                        refetch();
                      } catch (err: any) {
                        toast.error(
                          err.message || "Failed to reject invitation"
                        );
                      }
                    }}
                    disabled={rejectMutation.isPending}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6 space-y-4 bg-muted/50">
        <h3 className="font-semibold text-foreground">Role Permissions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["admin", "editor", "viewer"] as Role[]).map(role => (
            <div key={role} className="space-y-2">
              <p className="font-medium text-foreground capitalize">{role}</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                {role === "admin" && (
                  <>
                    <li>✓ Manage all collections</li>
                    <li>✓ Run all scans</li>
                    <li>✓ Manage team members</li>
                    <li>✓ Configure settings</li>
                  </>
                )}
                {role === "editor" && (
                  <>
                    <li>✓ Manage collections</li>
                    <li>✓ Run scans</li>
                    <li>✓ View reports</li>
                    <li>✗ Manage team</li>
                  </>
                )}
                {role === "viewer" && (
                  <>
                    <li>✓ View collections</li>
                    <li>✓ View scan results</li>
                    <li>✓ View reports</li>
                    <li>✗ Run scans</li>
                  </>
                )}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      {/* Remove Confirmation Dialog */}
      <AlertDialog
        open={!!removeDialogId}
        onOpenChange={open => !open && setRemoveDialogId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{removeDialogEmail}</strong> from your workspace?
              They will lose access immediately. You can re-invite them later if
              needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
