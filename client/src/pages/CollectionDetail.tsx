import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Scan,
  AlertTriangle,
  Shield,
  FileJson,
  Download,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

export default function CollectionDetail({
  params,
}: {
  params: { id: string };
}) {
  const [, navigate] = useLocation();
  const collectionId = params.id;

  const [activeTab, setActiveTab] = useState("overview");
  const [findingFilter, setFindingFilter] = useState<string>("all");
  const [findingStatusFilter, setFindingStatusFilter] = useState<string>("all");

  const {
    data: collection,
    isLoading,
    refetch,
  } = trpc.collections.getWithDetails.useQuery({ id: collectionId });
  const { data: scansData } = trpc.scanning.listScans.useQuery({
    collectionId,
    page: 1,
    pageSize: 50,
  });
  const { data: findingsData, refetch: refetchFindings } =
    trpc.scanning.getScan.useQuery(
      { scanId: scansData?.scans[0]?.id || "" },
      { enabled: !!scansData?.scans[0]?.id }
    );

  const updateFindingMutation = trpc.scanning.updateFindingStatus.useMutation({
    onSuccess: () => {
      toast.success("Finding status updated");
      refetchFindings();
    },
  });

  const startScanMutation = trpc.scanning.startScan.useMutation({
    onSuccess: () => {
      toast.success("Scan started");
      refetch();
    },
  });

  const exportReportMutation = trpc.compliance.exportReport.useMutation();

  const handleStartScan = async () => {
    try {
      await startScanMutation.mutateAsync({ collectionId, scanType: "full" });
    } catch (error) {
      toast.error("Failed to start scan");
    }
  };

  const handleExportPDF = async () => {
    if (!collection?.complianceReports[0]?.id) {
      toast.error("No compliance report to export");
      return;
    }
    try {
      const result = await exportReportMutation.mutateAsync({
        reportId: collection.complianceReports[0].id,
      });
      // Decode base64 PDF and download
      const pdfBlob = base64ToBlob(result.pdfBase64, "application/pdf");
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        result.filename ||
        `devpulse-compliance-report-${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF report downloaded successfully!");
    } catch (error) {
      toast.error("Failed to export report");
      console.error(error);
    }
  };

  // Helper to convert base64 to Blob
  const base64ToBlob = (base64: string, contentType: string): Blob => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  };

  const handleUpdateFindingStatus = async (
    findingId: string,
    status: string
  ) => {
    try {
      await updateFindingMutation.mutateAsync({
        findingId,
        status: status as "open" | "in-progress" | "resolved",
      });
    } catch (error) {
      toast.error("Failed to update finding status");
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "Critical":
        return "bg-red-500";
      case "High":
        return "bg-orange-500";
      case "Medium":
        return "bg-yellow-500";
      case "Low":
        return "bg-green-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "resolved":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "in-progress":
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Collection not found</p>
        <Button onClick={() => navigate("/collections")} className="mt-4">
          Back to Collections
        </Button>
      </div>
    );
  }

  const filteredFindings =
    findingsData?.findings?.filter(f => {
      if (findingFilter !== "all" && f.severity !== findingFilter) return false;
      if (findingStatusFilter !== "all" && f.status !== findingStatusFilter)
        return false;
      return true;
    }) || [];

  const latestReport = collection.complianceReports[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/collections")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{collection.name}</h1>
            {collection.description && (
              <p className="text-muted-foreground">{collection.description}</p>
            )}
          </div>
        </div>
        <Button
          onClick={handleStartScan}
          disabled={startScanMutation.isPending}
        >
          <Scan className="w-4 h-4 mr-2" />
          {startScanMutation.isPending ? "Scanning..." : "Scan Now"}
        </Button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{collection.totalRequests}</div>
            <p className="text-sm text-muted-foreground">API Endpoints</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{collection.totalScans}</div>
            <p className="text-sm text-muted-foreground">Total Scans</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{collection.totalFindings}</div>
            <p className="text-sm text-muted-foreground">Total Findings</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {collection.lastScanDate
                ? new Date(collection.lastScanDate).toLocaleDateString()
                : "Never"}
            </div>
            <p className="text-sm text-muted-foreground">Last Scan</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="scans">Scans</TabsTrigger>
          <TabsTrigger value="findings">Findings</TabsTrigger>
          <TabsTrigger value="shadow">Shadow APIs</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Collection Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Format
                  </p>
                  <p className="capitalize">{collection.format}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Import Date
                  </p>
                  <p>{new Date(collection.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Total Endpoints
                  </p>
                  <p>{collection.totalRequests}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Last Scan
                  </p>
                  <p>
                    {collection.lastScanDate
                      ? new Date(collection.lastScanDate).toLocaleString()
                      : "Never scanned"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Scans */}
        <TabsContent value="scans" className="space-y-4 mt-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Scan History</h2>
            <Button onClick={handleStartScan} size="sm">
              <Scan className="w-4 h-4 mr-2" />
              Run New Scan
            </Button>
          </div>
          {scansData?.scans && scansData.scans.length > 0 ? (
            <div className="space-y-2">
              {scansData.scans.map(scan => (
                <Card key={scan.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Scan className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium capitalize">
                            {scan.scanType} Scan
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(scan.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge
                          variant={
                            scan.riskLevel === "CRITICAL"
                              ? "destructive"
                              : scan.riskLevel === "HIGH"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {scan.riskLevel}
                        </Badge>
                        <span className="text-sm">
                          {scan.totalFindings} findings
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No scans yet. Run your first scan to see results.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 3: Findings */}
        <TabsContent value="findings" className="space-y-4 mt-6">
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <select
                value={findingFilter}
                onChange={e => setFindingFilter(e.target.value)}
                className="border rounded px-2 py-1"
              >
                <option value="all">All Severities</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={findingStatusFilter}
                onChange={e => setFindingStatusFilter(e.target.value)}
                className="border rounded px-2 py-1"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="in-progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>
          {filteredFindings.length > 0 ? (
            <div className="space-y-2">
              {filteredFindings.map(finding => (
                <Card key={finding.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <Badge className={getSeverityColor(finding.severity)}>
                          {finding.severity}
                        </Badge>
                        <div>
                          <p className="font-medium">{finding.title}</p>
                          {finding.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {finding.description}
                            </p>
                          )}
                          {finding.category && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Category: {finding.category}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(finding.status)}
                        <select
                          value={finding.status}
                          onChange={e =>
                            handleUpdateFindingStatus(
                              finding.id,
                              e.target.value
                            )
                          }
                          className="border rounded px-2 py-1 text-sm"
                        >
                          <option value="open">Open</option>
                          <option value="in-progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No findings found. Run a scan to detect security issues.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 4: Shadow APIs */}
        <TabsContent value="shadow" className="space-y-4 mt-6">
          {collection.shadowApis && collection.shadowApis.length > 0 ? (
            <div className="space-y-2">
              {collection.shadowApis.map(api => (
                <Card key={api.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-500" />
                        <div>
                          <p className="font-mono text-sm">
                            {api.method} {api.endpoint}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Detected{" "}
                            {new Date(api.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            api.riskLevel === "CRITICAL"
                              ? "destructive"
                              : api.riskLevel === "HIGH"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {api.riskLevel}
                        </Badge>
                        <Badge
                          variant={api.isDocumented ? "default" : "outline"}
                        >
                          {api.isDocumented ? "Documented" : "Undocumented"}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No shadow APIs detected.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 5: Compliance */}
        <TabsContent value="compliance" className="space-y-4 mt-6">
          {latestReport ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">PCI DSS Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-center">
                    {latestReport.complianceScore}%
                  </div>
                  <p className="text-center text-muted-foreground mt-2">
                    {latestReport.metRequirements}/
                    {latestReport.totalRequirements} requirements met
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">OWASP Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-center">
                    {latestReport.complianceScore}%
                  </div>
                  <p className="text-center text-muted-foreground mt-2">
                    Based on latest report
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No compliance reports yet. Generate a report to see compliance
                scores.
              </CardContent>
            </Card>
          )}
          <div className="flex justify-end">
            <Button onClick={handleExportPDF} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
