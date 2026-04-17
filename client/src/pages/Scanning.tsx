import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Zap, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

type SeverityLevel = "Critical" | "High" | "Medium" | "Low";

export default function Scanning() {
  const [location, navigate] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] || "");
  const collectionId = params.get("collection") || "";

  const [selectedSeverity, setSelectedSeverity] = useState<
    SeverityLevel | "all"
  >("all");
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);

  const { data: collections } = trpc.collections.list.useQuery();
  const {
    data: scans,
    isLoading: scansLoading,
    refetch: refetchScans,
  } = trpc.scanning.listScans.useQuery(
    { collectionId, scanType: "full" },
    { enabled: !!collectionId }
  );
  const { data: currentScan, refetch: refetchCurrentScan } =
    trpc.scanning.getScan.useQuery(
      { scanId: selectedScanId || "" },
      { enabled: !!selectedScanId }
    );

  const startScanMutation = trpc.scanning.startScan.useMutation();
  const updateStatusMutation = trpc.scanning.updateFindingStatus.useMutation();

  const handleStartScan = async () => {
    if (!collectionId) {
      toast.error("Please select a collection first");
      return;
    }

    try {
      await startScanMutation.mutateAsync({
        collectionId,
        scanType: "full",
      });
      toast.success("Scan completed!");
      refetchScans();
    } catch (error) {
      toast.error("Failed to start scan");
    }
  };

  const handleUpdateStatus = async (
    findingId: string,
    status: "open" | "in-progress" | "resolved"
  ) => {
    try {
      await updateStatusMutation.mutateAsync({ findingId, status });
      toast.success("Finding status updated!");
      refetchScans();
      refetchCurrentScan();
    } catch (error) {
      toast.error("Failed to update finding status");
    }
  };

  const severityColor = (severity: SeverityLevel) => {
    switch (severity) {
      case "Critical":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "High":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
      case "Medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "Low":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "open":
        return <AlertCircle className="w-4 h-4" />;
      case "in-progress":
        return <Clock className="w-4 h-4" />;
      case "resolved":
        return <CheckCircle2 className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const filteredFindings =
    currentScan?.findings?.filter((f: any) =>
      selectedSeverity === "all" ? true : f.severity === selectedSeverity
    ) || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">
          Security Scanning
        </h1>
        <p className="text-muted-foreground">
          Run OWASP vulnerability scans on your API collections
        </p>
      </div>

      {/* Collection Selector & Scan Button */}
      <Card className="p-6 space-y-4">
        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground block">
            Select Collection
          </label>
          <select
            value={collectionId}
            onChange={e => navigate(`/scanning?collection=${e.target.value}`)}
            className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground"
          >
            <option value="">Choose a collection...</option>
            {collections?.collections?.map(col => (
              <option key={col.id} value={col.id}>
                {col.name}
              </option>
            ))}
          </select>
        </div>

        {collectionId && (
          <Button
            onClick={handleStartScan}
            disabled={startScanMutation.isPending}
            className="w-full"
          >
            <Zap className="w-4 h-4 mr-2" />
            {startScanMutation.isPending ? "Scanning..." : "Start Scan"}
          </Button>
        )}
      </Card>

      {/* Scan History */}
      {collectionId && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-foreground">Scan History</h2>

          {scansLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading scans...
            </div>
          ) : scans?.scans && scans.scans.length > 0 ? (
            <div className="space-y-2">
              {scans.scans.map(scan => (
                <Card
                  key={scan.id}
                  onClick={() => setSelectedScanId(scan.id)}
                  className={`p-4 cursor-pointer transition-all ${
                    selectedScanId === scan.id
                      ? "border-accent bg-accent/5"
                      : "hover:shadow-md"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-foreground">
                        {scan.scanType === "full" ? "Full Scan" : "Quick Scan"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {scan.totalFindings} findings • Risk Score:{" "}
                        {Math.round(scan.riskScore)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${severityColor(
                          scan.riskLevel as SeverityLevel
                        )}`}
                      >
                        {scan.riskLevel}
                      </span>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(scan.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">
                No scans yet. Click "Start Scan" to begin.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Findings Details */}
      {selectedScanId && currentScan && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">Findings</h2>
            <div className="flex gap-2">
              {["all", "Critical", "High", "Medium", "Low"].map(severity => (
                <Button
                  key={severity}
                  variant={
                    selectedSeverity === severity ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() =>
                    setSelectedSeverity(severity as SeverityLevel | "all")
                  }
                >
                  {severity === "all" ? "All" : severity}
                </Button>
              ))}
            </div>
          </div>

          {filteredFindings.length > 0 ? (
            <div className="space-y-3">
              {filteredFindings.map((finding: any) => (
                <Card key={finding.id} className="p-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground text-lg">
                        {finding.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {finding.description}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${severityColor(finding.severity)}`}
                    >
                      {finding.severity}
                    </span>
                  </div>

                  {finding.category && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        Category
                      </p>
                      <p className="text-sm text-foreground">
                        {finding.category}
                      </p>
                    </div>
                  )}

                  {finding.remediation && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        Remediation
                      </p>
                      <p className="text-sm text-foreground">
                        {finding.remediation}
                      </p>
                    </div>
                  )}

                  {finding.cweId && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        CWE ID
                      </p>
                      <p className="text-sm text-foreground">{finding.cweId}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-4 border-t border-border/50">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      {statusIcon(finding.status)}
                      Status: {finding.status}
                    </span>
                    <div className="flex gap-2 ml-auto">
                      {finding.status !== "in-progress" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleUpdateStatus(finding.id, "in-progress")
                          }
                        >
                          In Progress
                        </Button>
                      )}
                      {finding.status !== "resolved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleUpdateStatus(finding.id, "resolved")
                          }
                        >
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">
                No findings with selected severity level.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
