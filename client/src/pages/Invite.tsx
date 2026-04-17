import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Shield, CheckCircle, XCircle, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";

const roleDescriptions: Record<string, string> = {
  admin: "Full access to all features and team management",
  editor: "Manage collections, run scans, and view reports",
  viewer: "Read-only access to collections and reports",
};

const roleColors: Record<string, string> = {
  admin: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  editor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  viewer:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

export default function Invite() {
  const [, params] = useRoute("/invite/:token");
  const [, setLocation] = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);

  const token = params?.token || "";

  const {
    data: invitation,
    isLoading,
    error,
  } = trpc.team.getInvitationByToken.useQuery({ token }, { enabled: !!token });

  const acceptMutation = trpc.team.acceptInvitationByToken.useMutation({
    onSuccess: () => {
      toast.success("Invitation accepted! Welcome to the workspace.");
      setLocation("/dashboard");
    },
    onError: err => {
      toast.error(err.message || "Failed to accept invitation");
      setIsProcessing(false);
    },
  });

  const declineMutation = trpc.team.declineInvitationByToken.useMutation({
    onSuccess: () => {
      toast.success("Invitation declined");
      setLocation("/");
    },
    onError: err => {
      toast.error(err.message || "Failed to decline invitation");
      setIsProcessing(false);
    },
  });

  const handleAccept = async () => {
    setIsProcessing(true);
    await acceptMutation.mutateAsync({ token });
  };

  const handleDecline = async () => {
    setIsProcessing(true);
    await declineMutation.mutateAsync({ token });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <Card className="p-8 max-w-md w-full text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-muted-foreground">Loading invitation...</p>
        </Card>
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <Card className="p-8 max-w-md w-full text-center">
          <XCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h1 className="text-xl font-bold mb-2">Invitation Not Found</h1>
          <p className="text-muted-foreground mb-4">
            This invitation may have expired, been declined, or already been
            accepted.
          </p>
          <Button
            onClick={() => setLocation("/")}
            variant="outline"
            className="w-full"
          >
            Go Home
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <Card className="p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Users className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-2">You're Invited!</h1>
          <p className="text-muted-foreground">
            Join <strong>{invitation.workspaceName}</strong> on DevPulse
          </p>
        </div>

        {/* Inviter Info */}
        <div className="bg-muted/50 rounded-lg p-4 mb-6">
          <p className="text-sm text-muted-foreground mb-1">Invited by</p>
          <p className="font-medium">{invitation.inviterName}</p>
        </div>

        {/* Role Info */}
        <div className="bg-muted/50 rounded-lg p-4 mb-6">
          <p className="text-sm text-muted-foreground mb-2">Your role</p>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${roleColors[invitation.role]}`}
            >
              {invitation.role}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {roleDescriptions[invitation.role]}
          </p>
        </div>

        {/* Invited Date */}
        <p className="text-xs text-muted-foreground text-center mb-6">
          Invited on {new Date(invitation.invitedAt).toLocaleDateString()}
        </p>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            onClick={handleAccept}
            disabled={isProcessing}
            className="w-full"
            size="lg"
          >
            {acceptMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Accepting...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Accept Invitation
              </>
            )}
          </Button>

          <Button
            onClick={handleDecline}
            disabled={isProcessing}
            variant="outline"
            className="w-full text-destructive hover:bg-destructive/10"
            size="lg"
          >
            {declineMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Declining...
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 mr-2" />
                Decline
              </>
            )}
          </Button>
        </div>

        {/* Footer */}
        <p className="text-xs text-muted-foreground text-center mt-6">
          By accepting, you'll join the workspace and can start collaborating
          immediately.
        </p>
      </Card>
    </div>
  );
}
