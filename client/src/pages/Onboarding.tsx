import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2,
  Circle,
  Upload,
  Zap,
  Eye,
  Users,
  FileText,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type OnboardingStep =
  | "importCollection"
  | "runScan"
  | "reviewFindings"
  | "inviteTeam"
  | "setupCompliance";

const STEPS: Array<{
  id: OnboardingStep;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: "importCollection",
    title: "Import Collection",
    description: "Upload your first API collection",
    icon: <Upload className="w-6 h-6" />,
  },
  {
    id: "runScan",
    title: "Run Scan",
    description: "Execute a security scan",
    icon: <Zap className="w-6 h-6" />,
  },
  {
    id: "reviewFindings",
    title: "Review Findings",
    description: "Examine security findings",
    icon: <Eye className="w-6 h-6" />,
  },
  {
    id: "inviteTeam",
    title: "Invite Team",
    description: "Add team members",
    icon: <Users className="w-6 h-6" />,
  },
  {
    id: "setupCompliance",
    title: "Setup Compliance",
    description: "Generate compliance reports",
    icon: <FileText className="w-6 h-6" />,
  },
];

export default function Onboarding() {
  const [, navigate] = useLocation();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [collectionName, setCollectionName] = useState("");
  const [teamEmail, setTeamEmail] = useState("");

  const { data: progress, refetch: refetchProgress } =
    trpc.onboarding.getProgress.useQuery();
  const completeStepMutation = trpc.onboarding.completeStep.useMutation();
  const completeMutation = trpc.onboarding.complete.useMutation();

  const currentStep = STEPS[currentStepIndex];
  const isStepCompleted = (stepId: OnboardingStep) => {
    if (!progress) return false;
    switch (stepId) {
      case "importCollection":
        return progress.importCollectionCompleted;
      case "runScan":
        return progress.runScanCompleted;
      case "reviewFindings":
        return progress.reviewFindingsCompleted;
      case "inviteTeam":
        return progress.inviteTeamCompleted;
      case "setupCompliance":
        return progress.setupComplianceCompleted;
      default:
        return false;
    }
  };

  const handleCompleteStep = async () => {
    try {
      await completeStepMutation.mutateAsync({ step: currentStep.id });
      toast.success(`${currentStep.title} completed!`);
      refetchProgress();

      if (currentStepIndex < STEPS.length - 1) {
        setCurrentStepIndex(currentStepIndex + 1);
      } else {
        // All steps completed
        await completeMutation.mutateAsync();
        toast.success("Onboarding completed! Welcome to DevPulse!");
        navigate("/dashboard");
      }
    } catch (error) {
      toast.error("Failed to complete step");
    }
  };

  const handleSkip = () => {
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      navigate("/dashboard");
    }
  };

  const completionPercentage = progress
    ? (Object.values(progress).filter(v => v === true).length / 5) * 100
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent/10 to-accent/5 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-foreground">
            Welcome to DevPulse
          </h1>
          <p className="text-lg text-muted-foreground">
            Let's set up your API security platform in 5 simple steps
          </p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              Your Progress
            </span>
            <span className="text-sm font-medium text-accent">
              {Math.round(completionPercentage)}%
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>

        {/* Steps Navigation */}
        <div className="grid grid-cols-5 gap-2">
          {STEPS.map((step, index) => (
            <button
              key={step.id}
              onClick={() => setCurrentStepIndex(index)}
              className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all ${
                index === currentStepIndex
                  ? "bg-accent text-accent-foreground shadow-lg"
                  : isStepCompleted(step.id)
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {isStepCompleted(step.id) ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Circle className="w-5 h-5" />
              )}
              <span className="text-xs font-medium text-center">
                {step.title}
              </span>
            </button>
          ))}
        </div>

        {/* Current Step Content */}
        <Card className="p-8 space-y-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
              {currentStep.icon}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-foreground">
                {currentStep.title}
              </h2>
              <p className="text-muted-foreground mt-1">
                {currentStep.description}
              </p>
            </div>
          </div>

          {/* Step-specific Content */}
          <div className="space-y-4 py-4 border-t border-border">
            {currentStep.id === "importCollection" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Start by uploading your first Postman or OpenAPI collection.
                  This will allow DevPulse to analyze your API endpoints.
                </p>
                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Collection Name
                    </label>
                    <Input
                      placeholder="My API Collection"
                      value={collectionName}
                      onChange={e => setCollectionName(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={() => navigate("/collections")}
                    variant="outline"
                    className="w-full"
                  >
                    Go to Collections
                  </Button>
                </div>
              </div>
            )}

            {currentStep.id === "runScan" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Run a comprehensive security scan on your imported collection
                  to identify vulnerabilities and security issues.
                </p>
                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    Collection imported
                  </div>
                  <Button
                    onClick={() => navigate("/scanning")}
                    variant="outline"
                    className="w-full"
                  >
                    Start Security Scan
                  </Button>
                </div>
              </div>
            )}

            {currentStep.id === "reviewFindings" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Review the security findings from your scan. Findings are
                  categorized by severity: Critical, High, Medium, and Low.
                </p>
                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span>Critical</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-orange-500" />
                      <span>High</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      <span>Medium</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span>Low</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => navigate("/scanning")}
                    variant="outline"
                    className="w-full"
                  >
                    Review Findings
                  </Button>
                </div>
              </div>
            )}

            {currentStep.id === "inviteTeam" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Invite your team members to collaborate on API security. You
                  can assign roles: admin, editor, or viewer.
                </p>
                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">
                      Team Member Email
                    </label>
                    <Input
                      type="email"
                      placeholder="colleague@company.com"
                      value={teamEmail}
                      onChange={e => setTeamEmail(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={() => navigate("/team")}
                    variant="outline"
                    className="w-full"
                  >
                    Manage Team
                  </Button>
                </div>
              </div>
            )}

            {currentStep.id === "setupCompliance" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Generate PCI DSS compliance reports to ensure your APIs meet
                  regulatory requirements.
                </p>
                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    All prerequisites completed
                  </div>
                  <Button
                    onClick={() => navigate("/compliance")}
                    variant="outline"
                    className="w-full"
                  >
                    Generate Compliance Report
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-4 border-t border-border">
            <Button onClick={handleSkip} variant="ghost" className="flex-1">
              {currentStepIndex === STEPS.length - 1 ? "Finish" : "Skip"}
            </Button>
            <Button
              onClick={handleCompleteStep}
              disabled={completeStepMutation.isPending}
              className="flex-1"
            >
              {completeStepMutation.isPending
                ? "Completing..."
                : "Complete Step"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </Card>

        {/* Tips */}
        <Card className="p-4 bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30">
          <p className="text-sm text-blue-900 dark:text-blue-300">
            <strong>Tip:</strong> You can complete these steps in any order.
            Come back to this page anytime to continue your onboarding.
          </p>
        </Card>
      </div>
    </div>
  );
}
