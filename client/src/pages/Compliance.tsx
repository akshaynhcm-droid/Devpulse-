import React from "react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, XCircle, AlertTriangle, FileText, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type ReportType = "pci_dss" | "owasp";

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  pci_dss: "PCI DSS 4.0",
  owasp: "OWASP Top 10",
};

const STATUS_ICONS: Record<string, React.ReactElement> = {
  met: <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />,
  not_met: <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />,
  manual_review: <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />,
};

const STATUS_LABELS: Record<string, string> = {
  met: "Met",
  not_met: "Not Met",
  manual_review: "Manual Review Required",
};

const STATUS_COLORS: Record<string, string> = {
  met: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  not_met: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  manual_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
};

export default function Compliance() {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedReportType, setSelectedReportType] = useState<ReportType>("pci_dss");
  const [collectionId, setCollectionId] = useState("");

  const { data: collections } = trpc.collections.list.useQuery();
  const { data: reports, refetch: refetchReports } = trpc.compliance.listReports.useQuery(
    { collectionId },
    { enabled: !!collectionId }
  );
  const { data: currentReport } = trpc.compliance.getReport.useQuery(
    { reportId: selectedReportId || "" },
    { enabled: !!selectedReportId }
  );

  const generateMutation = trpc.compliance.generateReport.useMutation();

  const handleGenerate = async () => {
    if (!collectionId) {
      toast.error("Please select a collection first");
      return;
    }

    try {
      const result = await generateMutation.mutateAsync({
        collectionId,
        reportType: selectedReportType,
      });
      toast.success(
        `${REPORT_TYPE_LABELS[selectedReportType]} report generated! Score: ${result.complianceScore}%`
      );
      refetchReports();
      setSelectedReportId(result.reportId);
    } catch {
      toast.error("Failed to generate compliance report");
    }
  };

  const handleExportPDF = () => {
    if (!currentReport) return;
    const title = `${REPORT_TYPE_LABELS[currentReport.reportType as ReportType] || currentReport.reportType} Compliance Report`;
    const printContent = `
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 900px; margin: 0 auto; color: #111827; }
          h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
          .score { font-size: 48px; font-weight: 800; color: #2563eb; margin: 24px 0; }
          .meta { color: #6b7280; font-size: 14px; margin-bottom: 32px; }
          .stats { display: flex; gap: 24px; margin-bottom: 32px; }
          .stat { background: #f9fafb; border-radius: 8px; padding: 16px 24px; }
          .stat-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
          .stat-value { font-size: 24px; font-weight: 700; color: #111827; }
          table { width: 100%; border-collapse: collapse; margin-top: 24px; }
          th { background: #f3f4f6; text-align: left; padding: 12px 16px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; }
          td { padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
          .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
          .met { background: #d1fae5; color: #065f46; }
          .not_met { background: #fee2e2; color: #991b1b; }
          .manual_review { background: #fef3c7; color: #92400e; }
          .footer { margin-top: 40px; color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 24px; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="meta">Generated on ${new Date(currentReport.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
        <div class="score">${currentReport.complianceScore.toFixed(1)}%</div>
        <div class="stats">
          <div class="stat"><div class="stat-label">Total Requirements</div><div class="stat-value">${currentReport.totalRequirements}</div></div>
          <div class="stat"><div class="stat-label">Met</div><div class="stat-value" style="color:#065f46">${currentReport.metRequirements}</div></div>
          <div class="stat"><div class="stat-label">Manual Review</div><div class="stat-value" style="color:#92400e">${currentReport.manualRequirements ?? 0}</div></div>
          <div class="stat"><div class="stat-label">Not Met</div><div class="stat-value" style="color:#991b1b">${currentReport.notMetRequirements ?? 0}</div></div>
        </div>
        <table>
          <thead><tr><th>ID</th><th>Requirement</th><th>Description</th><th>Status</th></tr></thead>
          <tbody>
            ${(currentReport.requirements as any[]).map(r => `
              <tr>
                <td><strong>${r.id}</strong></td>
                <td>${r.title}</td>
                <td style="color:#6b7280">${r.description}</td>
                <td><span class="badge ${r.status}">${STATUS_LABELS[r.status] ?? r.status}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <div class="footer">Generated by DevPulse — API Security & LLM Intelligence Platform</div>
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      toast.error("Pop-up blocked. Please allow pop-ups and try again.");
      return;
    }
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
    toast.success("Report exported for printing / PDF save.");
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Compliance Reports</h1>
        <p className="text-muted-foreground">
          Generate PCI DSS and OWASP Top 10 compliance assessments for your API collections
        </p>
      </div>

      {/* Generator */}
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Generate Report</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Collection
            </label>
            <select
              value={collectionId}
              onChange={(e) => {
                setCollectionId(e.target.value);
                setSelectedReportId(null);
              }}
              className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground"
            >
              <option value="">Choose collection...</option>
              {collections?.collections?.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Standard
            </label>
            <select
              value={selectedReportType}
              onChange={(e) => setSelectedReportType(e.target.value as ReportType)}
              className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground"
            >
              {Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending || !collectionId}
            className="w-full"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${generateMutation.isPending ? "animate-spin" : ""}`} />
            {generateMutation.isPending ? "Generating..." : "Generate Report"}
          </Button>
        </div>
      </Card>

      {/* Reports List */}
      {collectionId && reports?.reports && reports.reports.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">
            Compliance Reports ({reports.total})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.reports.map((report) => (
              <Card
                key={report.id}
                onClick={() => setSelectedReportId(report.id)}
                className={`p-5 cursor-pointer transition-all space-y-3 ${
                  selectedReportId === report.id
                    ? "border-accent bg-accent/5"
                    : "hover:shadow-md"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {REPORT_TYPE_LABELS[report.reportType as ReportType] || report.reportType}
                  </span>
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className={`text-3xl font-bold ${getScoreColor(report.complianceScore)}`}>
                  {report.complianceScore.toFixed(1)}%
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>{report.metRequirements}/{report.totalRequirements} met</span>
                  <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Selected Report Details */}
      {selectedReportId && currentReport && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {REPORT_TYPE_LABELS[currentReport.reportType as ReportType] || currentReport.reportType} Report Details
              </h2>
              <p className="text-sm text-muted-foreground">
                Generated on {new Date(currentReport.createdAt).toLocaleDateString("en-US", {
                  year: "numeric", month: "long", day: "numeric",
                })}
              </p>
            </div>
            <Button onClick={handleExportPDF} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
          </div>

          {/* Score Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-5 text-center space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Score</p>
              <p className={`text-4xl font-bold ${getScoreColor(currentReport.complianceScore)}`}>
                {currentReport.complianceScore.toFixed(1)}%
              </p>
            </Card>
            <Card className="p-5 text-center space-y-1 border-green-200 dark:border-green-900">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Met</p>
              <p className="text-4xl font-bold text-green-600 dark:text-green-400">
                {currentReport.metRequirements}
              </p>
            </Card>
            <Card className="p-5 text-center space-y-1 border-yellow-200 dark:border-yellow-900">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Manual Review</p>
              <p className="text-4xl font-bold text-yellow-600 dark:text-yellow-400">
                {currentReport.manualRequirements ?? 0}
              </p>
            </Card>
            <Card className="p-5 text-center space-y-1 border-red-200 dark:border-red-900">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Not Met</p>
              <p className="text-4xl font-bold text-red-600 dark:text-red-400">
                {currentReport.notMetRequirements ?? 0}
              </p>
            </Card>
          </div>

          {/* Requirements Table */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Requirements Breakdown</h3>
            </div>
            <div className="divide-y divide-border">
              {(currentReport.requirements as any[]).map((req) => (
                <div key={req.id} className="p-4 flex items-start gap-4">
                  {STATUS_ICONS[req.status] ?? <AlertTriangle className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-medium text-foreground text-sm">
                          <span className="text-muted-foreground font-mono text-xs mr-2">{req.id}</span>
                          {req.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {req.description}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${STATUS_COLORS[req.status] ?? ""}`}
                      >
                        {STATUS_LABELS[req.status] ?? req.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Empty State */}
      {collectionId && (!reports?.reports || reports.reports.length === 0) && !generateMutation.isPending && (
        <Card className="p-12 text-center space-y-4">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto" />
          <div>
            <p className="font-medium text-foreground">No compliance reports yet</p>
            <p className="text-sm text-muted-foreground">
              Generate your first PCI DSS or OWASP report above
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
