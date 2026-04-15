import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { AlertCircle, TrendingUp, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { data: metrics, isLoading: metricsLoading } = trpc.dashboard.getMetrics.useQuery();
  const { data: recentScans, isLoading: scansLoading } = trpc.dashboard.getRecentScans.useQuery();

  const riskLevelColor = (level: string) => {
    switch (level) {
      case "CRITICAL":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "HIGH":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
      case "MEDIUM":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "LOW":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
    }
  };

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Welcome to DevPulse</h1>
        <p className="text-muted-foreground">
          Your API security and LLM cost intelligence platform
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Collections */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Collections</p>
              <p className="text-3xl font-bold text-foreground">
                {metricsLoading ? "-" : metrics?.totalCollections || 0}
              </p>
            </div>
            <Shield className="w-8 h-8 text-accent" />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/collections")}
            className="w-full justify-start text-accent hover:text-accent"
          >
            View Collections →
          </Button>
        </Card>

        {/* Total Findings */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Findings</p>
              <p className="text-3xl font-bold text-foreground">
                {metricsLoading ? "-" : metrics?.totalFindings || 0}
              </p>
            </div>
            <AlertCircle className="w-8 h-8 text-orange-500" />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/scanning")}
            className="w-full justify-start text-accent hover:text-accent"
          >
            Review Findings →
          </Button>
        </Card>

        {/* Highest Risk Score */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Highest Risk Score</p>
              <p className="text-3xl font-bold text-foreground">
                {metricsLoading ? "-" : metrics?.highestRiskScore || 0}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-red-500" />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/scanning")}
            className="w-full justify-start text-accent hover:text-accent"
          >
            Run Scan →
          </Button>
        </Card>

        {/* Team Members */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Team Members</p>
              <p className="text-3xl font-bold text-foreground">
                {metricsLoading ? "-" : metrics?.teamMembers || 0}
              </p>
            </div>
            <Users className="w-8 h-8 text-blue-500" />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/team")}
            className="w-full justify-start text-accent hover:text-accent"
          >
            Manage Team →
          </Button>
        </Card>
      </div>

      {/* Recent Scans */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-foreground">Recent Scans</h2>
          <Button onClick={() => navigate("/scanning")} variant="outline" size="sm">
            View All Scans
          </Button>
        </div>

        {scansLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading scans...</div>
        ) : recentScans?.scans && recentScans.scans.length > 0 ? (
          <div className="space-y-2">
            {recentScans.scans.map((scan) => (
              <Card key={scan.id} className="p-4 flex items-center justify-between hover:shadow-md transition-shadow">
                <div className="flex-1">
                  <p className="font-medium text-foreground">{scan.collectionName}</p>
                  <p className="text-sm text-muted-foreground">
                    {scan.totalFindings} findings • Risk Score: {Math.round(scan.riskScore)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${riskLevelColor(
                      scan.riskLevel
                    )}`}
                  >
                    {scan.riskLevel}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {new Date(scan.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No scans yet. Get started by importing a collection.</p>
            <Button onClick={() => navigate("/collections")} className="mx-auto">
              Import Collection
            </Button>
          </Card>
        )}
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button
            onClick={() => navigate("/collections")}
            className="h-12 text-base font-semibold"
            variant="outline"
          >
            + Import Collection
          </Button>
          <Button
            onClick={() => navigate("/team")}
            className="h-12 text-base font-semibold"
            variant="outline"
          >
            + Invite Team Member
          </Button>
          <Button
            onClick={() => navigate("/kill-switch")}
            className="h-12 text-base font-semibold"
            variant="outline"
          >
            ⚡ Configure Kill Switch
          </Button>
          <Button
            onClick={() => navigate("/compliance")}
            className="h-12 text-base font-semibold"
            variant="outline"
          >
            📋 Generate Compliance Report
          </Button>
        </div>
      </div>
    </div>
  );
}
