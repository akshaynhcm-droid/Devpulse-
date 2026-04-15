import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Eye, Zap, CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export default function ShadowAPIs() {
  const [location, navigate] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] || "");
  const collectionId = params.get("collection") || "";

  const { data: collections } = trpc.collections.list.useQuery();
  const { data: shadowData, isLoading, refetch } = trpc.shadowAPI.listShadowAPIs.useQuery(
    { collectionId },
    { enabled: !!collectionId }
  );

  const scanMutation = trpc.shadowAPI.scanShadowAPIs.useMutation();
  const markDocumentedMutation = trpc.shadowAPI.markAsDocumented.useMutation();

  const handleScan = async () => {
    if (!collectionId) {
      toast.error("Please select a collection first");
      return;
    }
    try {
      const result = await scanMutation.mutateAsync({ collectionId });
      toast.success(`Shadow API scan complete — ${result.totalFound} APIs detected`);
      refetch();
    } catch {
      toast.error("Failed to run shadow API scan");
    }
  };

  const handleMarkDocumented = async (shadowApiId: string) => {
    try {
      await markDocumentedMutation.mutateAsync({ shadowApiId });
      toast.success("Marked as documented");
      refetch();
    } catch {
      toast.error("Failed to mark as documented");
    }
  };

  const riskBadge = (level: RiskLevel) => {
    const map: Record<RiskLevel, string> = {
      CRITICAL: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
      MEDIUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      LOW: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    };
    return map[level] ?? "bg-gray-100 text-gray-800";
  };

  const methodBadge = (method: string) => {
    const map: Record<string, string> = {
      GET: "bg-blue-100 text-blue-700",
      POST: "bg-green-100 text-green-700",
      PUT: "bg-yellow-100 text-yellow-700",
      DELETE: "bg-red-100 text-red-700",
      PATCH: "bg-purple-100 text-purple-700",
    };
    return map[method] ?? "bg-gray-100 text-gray-700";
  };

  const summaryStats = shadowData?.shadowAPIs ?? [];
  const critical = summaryStats.filter(a => a.riskLevel === "CRITICAL").length;
  const high = summaryStats.filter(a => a.riskLevel === "HIGH").length;
  const undocumented = summaryStats.filter(a => !a.isDocumented).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Shadow API Detection</h1>
        <p className="text-muted-foreground">
          Discover undocumented, hidden, and risky API endpoints in your collections
        </p>
      </div>

      {/* Collection Selector & Scan */}
      <Card className="p-6 space-y-4">
        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground block">Select Collection</label>
          <select
            value={collectionId}
            onChange={e => navigate(`/shadow-apis?collection=${e.target.value}`)}
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
            onClick={handleScan}
            disabled={scanMutation.isPending}
            className="w-full"
          >
            <Eye className="w-4 h-4 mr-2" />
            {scanMutation.isPending ? "Scanning for Shadow APIs..." : "Run Shadow API Scan"}
          </Button>
        )}
      </Card>

      {/* Summary Stats */}
      {collectionId && summaryStats.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 space-y-2 border-l-4 border-l-red-500">
            <p className="text-sm font-medium text-muted-foreground">Critical / High Risk</p>
            <p className="text-3xl font-bold text-foreground">{critical + high}</p>
            <p className="text-xs text-muted-foreground">Require immediate attention</p>
          </Card>
          <Card className="p-5 space-y-2 border-l-4 border-l-orange-500">
            <p className="text-sm font-medium text-muted-foreground">Undocumented APIs</p>
            <p className="text-3xl font-bold text-foreground">{undocumented}</p>
            <p className="text-xs text-muted-foreground">Not in official spec</p>
          </Card>
          <Card className="p-5 space-y-2 border-l-4 border-l-accent">
            <p className="text-sm font-medium text-muted-foreground">Total Detected</p>
            <p className="text-3xl font-bold text-foreground">{summaryStats.length}</p>
            <p className="text-xs text-muted-foreground">Shadow API endpoints found</p>
          </Card>
        </div>
      )}

      {/* Results */}
      {collectionId && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-foreground">Detected Shadow APIs</h2>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Scanning for shadow APIs...</div>
          ) : summaryStats.length > 0 ? (
            <div className="space-y-3">
              {summaryStats.map(api => (
                <Card key={api.id} className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      {api.riskLevel === "CRITICAL" || api.riskLevel === "HIGH" ? (
                        <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold font-mono ${methodBadge(
                              api.method ?? "GET"
                            )}`}
                          >
                            {api.method ?? "GET"}
                          </span>
                          <code className="text-sm font-mono font-semibold text-foreground break-all">
                            {api.endpoint}
                          </code>
                        </div>

                        {api.reason && (
                          <p className="text-sm text-muted-foreground mt-2">
                            <span className="font-medium">Issue:</span> {api.reason}
                          </p>
                        )}
                        {api.recommendation && (
                          <p className="text-sm text-muted-foreground mt-1">
                            <span className="font-medium">Recommendation:</span> {api.recommendation}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${riskBadge(
                          api.riskLevel as RiskLevel
                        )}`}
                      >
                        {api.riskLevel}
                      </span>
                      {api.isDocumented ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <CheckCircle2 className="w-4 h-4" />
                          Documented
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={() => handleMarkDocumented(api.id)}
                          disabled={markDocumentedMutation.isPending}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Mark Documented
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-12 text-center space-y-4">
              <Eye className="w-12 h-12 text-muted-foreground mx-auto" />
              <div>
                <p className="font-medium text-foreground">No shadow APIs detected yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Click "Run Shadow API Scan" to discover undocumented endpoints
                </p>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Info Panel */}
      <Card className="p-5 bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30 space-y-2">
        <h3 className="font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-2">
          <Zap className="w-4 h-4" />
          What are Shadow APIs?
        </h3>
        <p className="text-sm text-blue-800 dark:text-blue-400">
          Shadow APIs are endpoints that exist in your codebase or collections but are not
          officially documented in your API specification. They may include debug endpoints,
          internal APIs, legacy routes, or admin endpoints — all of which can be security risks.
        </p>
      </Card>
    </div>
  );
}
