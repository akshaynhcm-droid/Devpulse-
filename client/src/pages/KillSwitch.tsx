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
import { AlertTriangle, Zap, Clock, DollarSign, ShieldCheck, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export default function KillSwitch() {
  const [budgetInput, setBudgetInput] = useState("");
  const [triggerReason, setTriggerReason] = useState("");
  const [resetReason, setResetReason] = useState("");
  const [showTriggerDialog, setShowTriggerDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const { data: settings, refetch: refetchSettings } = trpc.killSwitch.getSettings.useQuery();
  const { data: auditTrail, refetch: refetchAudit } = trpc.killSwitch.getAuditTrail.useQuery();

  const setBudgetMutation = trpc.killSwitch.setBudget.useMutation();
  const triggerMutation = trpc.killSwitch.trigger.useMutation();
  const resetMutation = trpc.killSwitch.reset.useMutation();

  const handleSetBudget = async () => {
    if (!budgetInput || isNaN(parseFloat(budgetInput)) || parseFloat(budgetInput) <= 0) {
      toast.error("Please enter a valid positive budget amount");
      return;
    }

    try {
      await setBudgetMutation.mutateAsync({
        budgetLimitUSD: parseFloat(budgetInput),
      });
      toast.success("Budget limit updated successfully!");
      setBudgetInput("");
      refetchSettings();
      refetchAudit();
    } catch {
      toast.error("Failed to set budget limit");
    }
  };

  const handleTrigger = async () => {
    if (!triggerReason.trim()) {
      toast.error("Please provide a reason for triggering the kill switch");
      return;
    }

    try {
      await triggerMutation.mutateAsync({ reason: triggerReason });
      toast.success("Kill switch triggered! All LLM operations are now blocked.");
      setTriggerReason("");
      setShowTriggerDialog(false);
      refetchSettings();
      refetchAudit();
    } catch {
      toast.error("Failed to trigger kill switch");
    }
  };

  const handleReset = async () => {
    if (!resetReason.trim()) {
      toast.error("Please provide a reason for resetting the kill switch");
      return;
    }

    try {
      await resetMutation.mutateAsync({ reason: resetReason });
      toast.success("Kill switch reset! LLM operations are now unblocked.");
      setResetReason("");
      setShowResetDialog(false);
      refetchSettings();
      refetchAudit();
    } catch {
      toast.error("Failed to reset kill switch");
    }
  };

  const spendPercentage = settings
    ? Math.min(100, (settings.currentSpendUSD / settings.budgetLimitUSD) * 100)
    : 0;

  const getEventLabel = (eventType: string) => {
    switch (eventType) {
      case "budget_set": return "Budget Updated";
      case "triggered": return "Kill Switch Triggered";
      case "auto_triggered": return "Auto-Triggered (Budget Exceeded)";
      case "reset": return "Kill Switch Reset";
      default: return eventType;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Autonomous Agent Kill Switch</h1>
        <p className="text-muted-foreground">
          Manage LLM spending limits and emergency controls
        </p>
      </div>

      {/* Budget Status */}
      {settings && (
        <Card className={`p-8 space-y-6 border-2 ${settings.isActive ? "border-destructive/50 bg-destructive/5" : "border-accent/20"}`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">Budget Status</h2>
              {settings.isActive ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-destructive text-destructive-foreground">
                  <Zap className="w-3 h-3" />
                  ACTIVE — LLM Blocked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  <ShieldCheck className="w-3 h-3" />
                  Normal Operation
                </span>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Current Spending</span>
                <span className="text-2xl font-bold text-foreground">
                  ${settings.currentSpendUSD.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Budget Limit</span>
                <span className="text-2xl font-bold text-accent">
                  ${settings.budgetLimitUSD.toFixed(2)}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Usage</span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {spendPercentage.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      spendPercentage > 80
                        ? "bg-destructive"
                        : spendPercentage > 50
                          ? "bg-orange-500"
                          : "bg-green-500"
                    }`}
                    style={{ width: `${spendPercentage}%` }}
                  />
                </div>
              </div>

              {settings.isActive && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                  <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-destructive">
                      Kill Switch is ACTIVE — All LLM operations are blocked
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowResetDialog(true)}
                    className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Reset
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Budget Configuration */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Set Budget Limit</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Monthly Budget (USD)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="100.00"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="pl-8"
                  min="0.01"
                  step="0.01"
                />
              </div>
              <Button
                onClick={handleSetBudget}
                disabled={setBudgetMutation.isPending}
              >
                {setBudgetMutation.isPending ? "Setting..." : "Set Budget"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Emergency Trigger */}
      <Card className="p-6 space-y-4 border-2 border-destructive/20">
        <h2 className="text-lg font-semibold text-foreground">Emergency Controls</h2>
        <p className="text-sm text-muted-foreground">
          Immediately stop all LLM operations. This action is logged and fully auditable.
        </p>
        <div className="flex gap-3">
          {!settings?.isActive ? (
            <Button
              onClick={() => setShowTriggerDialog(true)}
              className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              <Zap className="w-4 h-4 mr-2" />
              Trigger Kill Switch
            </Button>
          ) : (
            <Button
              onClick={() => setShowResetDialog(true)}
              disabled={resetMutation.isPending}
              className="flex-1"
              variant="outline"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              {resetMutation.isPending ? "Resetting..." : "Reset Kill Switch"}
            </Button>
          )}
        </div>
      </Card>

      {/* Audit Trail */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground">Audit Trail</h2>

        {auditTrail?.events && auditTrail.events.length > 0 ? (
          <div className="space-y-2">
            {auditTrail.events.map((event) => (
              <Card key={event.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {event.eventType === "triggered" || event.eventType === "auto_triggered" ? (
                        <AlertTriangle className="w-5 h-5 text-destructive" />
                      ) : event.eventType === "reset" ? (
                        <RotateCcw className="w-5 h-5 text-green-500" />
                      ) : (
                        <Clock className="w-5 h-5 text-accent" />
                      )}
                      <span className="font-semibold text-foreground">
                        {getEventLabel(event.eventType)}
                      </span>
                    </div>

                    {event.budgetLimit !== undefined && event.budgetLimit !== null && (
                      <p className="text-sm text-muted-foreground">
                        Budget: ${(event.budgetLimit as number).toFixed(2)}
                      </p>
                    )}

                    {event.currentSpend !== undefined && event.currentSpend !== null && (
                      <p className="text-sm text-muted-foreground">
                        Spend at time: ${(event.currentSpend as number).toFixed(2)}
                      </p>
                    )}

                    {event.reason && (
                      <p className="text-sm text-muted-foreground mt-2">
                        <span className="font-medium">Reason:</span> {event.reason}
                      </p>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(event.createdAt).toLocaleString()}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No audit trail events yet.</p>
          </Card>
        )}
      </div>

      {/* Trigger Dialog */}
      <AlertDialog open={showTriggerDialog} onOpenChange={setShowTriggerDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Trigger Kill Switch?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately block all LLM API calls. The action will be logged and you
              will need to manually reset the kill switch to resume operations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-foreground mb-2 block">
              Reason for triggering <span className="text-destructive">*</span>
            </label>
            <textarea
              placeholder="Describe why you are triggering the kill switch..."
              value={triggerReason}
              onChange={(e) => setTriggerReason(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTriggerReason("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTrigger}
              disabled={triggerMutation.isPending || !triggerReason.trim()}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {triggerMutation.isPending ? "Triggering..." : "Yes, Trigger Kill Switch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-green-500" />
              Reset Kill Switch?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will re-enable LLM API calls. Make sure you have resolved the issue that
              caused the kill switch to be triggered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-foreground mb-2 block">
              Reason for resetting <span className="text-destructive">*</span>
            </label>
            <textarea
              placeholder="Describe why you are resetting the kill switch..."
              value={resetReason}
              onChange={(e) => setResetReason(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setResetReason("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReset}
              disabled={resetMutation.isPending || !resetReason.trim()}
            >
              {resetMutation.isPending ? "Resetting..." : "Reset Kill Switch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
