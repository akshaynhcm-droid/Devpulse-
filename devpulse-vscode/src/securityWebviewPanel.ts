/**
 * DevPulse Security Webview Panel.
 *
 * A self-contained VS Code WebviewPanel that shows:
 *   - headline counts (collections, open findings, weekly LLM cost)
 *   - a table of recent findings with severity-colored chips
 *
 * No external scripts, no bundler — inline CSS only so the panel works in
 * Restricted Mode and in environments that disable remote resource loading.
 */
import * as vscode from "vscode";
import type { DevPulseApi, DashboardData, Finding } from "./api";

type PanelState = {
  dashboard: DashboardData | null;
  findings: Finding[];
  error: string | null;
};

export class SecurityWebviewPanel {
  private static current: SecurityWebviewPanel | undefined;
  public static readonly viewType = "devpulse.security";

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly api: DevPulseApi
  ) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      msg => {
        if (msg && typeof msg === "object" && msg.type === "refresh") {
          void this.refresh();
        }
      },
      null,
      this.disposables
    );
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    api: DevPulseApi
  ): void {
    const column =
      vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (SecurityWebviewPanel.current) {
      SecurityWebviewPanel.current.panel.reveal(column);
      void SecurityWebviewPanel.current.refresh();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      SecurityWebviewPanel.viewType,
      "DevPulse Security Dashboard",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    SecurityWebviewPanel.current = new SecurityWebviewPanel(panel, api);
    void SecurityWebviewPanel.current.refresh();
  }

  private async refresh(): Promise<void> {
    this.panel.webview.html = this._getHtmlForWebview(this.panel.webview, {
      dashboard: null,
      findings: [],
      error: null,
    });

    try {
      const [dashboard, findings] = await Promise.all([
        this.api.getDashboardData(),
        this.api.getRecentFindings(20),
      ]);
      this.panel.webview.html = this._getHtmlForWebview(this.panel.webview, {
        dashboard,
        findings,
        error: null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.panel.webview.html = this._getHtmlForWebview(this.panel.webview, {
        dashboard: null,
        findings: [],
        error: msg,
      });
    }
  }

  public dispose(): void {
    SecurityWebviewPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length > 0) {
      const d = this.disposables.pop();
      d?.dispose();
    }
  }

  private _getHtmlForWebview(
    webview: vscode.Webview,
    state: PanelState
  ): string {
    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `style-src 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
    ].join("; ");

    const { dashboard, findings, error } = state;

    const statCard = (label: string, value: string, hint: string) => `
      <div class="card">
        <div class="card-label">${escapeHtml(label)}</div>
        <div class="card-value">${escapeHtml(value)}</div>
        <div class="card-hint">${escapeHtml(hint)}</div>
      </div>
    `;

    const severityColor = (sev: string) => {
      switch (sev) {
        case "Critical":
          return "#ef4444";
        case "High":
          return "#f97316";
        case "Medium":
          return "#eab308";
        case "Low":
        default:
          return "#3b82f6";
      }
    };

    const statusLabel = (s: string) => {
      if (s === "in-progress") return "In progress";
      if (s === "resolved") return "Resolved";
      return "Open";
    };

    const findingsRows = findings
      .map(
        f => `
      <tr>
        <td class="col-title">${escapeHtml(f.title)}</td>
        <td>
          <span class="chip" style="background:${severityColor(
            f.severity
          )};color:#0F172A;">${escapeHtml(f.severity)}</span>
        </td>
        <td>${escapeHtml(f.collectionName)}</td>
        <td class="col-status">${escapeHtml(statusLabel(f.status))}</td>
      </tr>`
      )
      .join("");

    const body = error
      ? `<div class="error">
           <h2>Could not load dashboard</h2>
           <p>${escapeHtml(error)}</p>
           <button id="refresh-btn">Try again</button>
         </div>`
      : dashboard === null
        ? `<div class="loading">Loading DevPulse dashboard…</div>`
        : `
      <header class="hdr">
        <div>
          <h1>DevPulse Security Dashboard</h1>
          <p class="sub">Live data from your DevPulse workspace.</p>
        </div>
        <button id="refresh-btn">Refresh</button>
      </header>
      <section class="stat-grid">
        ${statCard(
          "Collections",
          String(dashboard.collections),
          "API specs tracked"
        )}
        ${statCard(
          "Open findings",
          String(dashboard.openFindings),
          `of ${dashboard.totalFindings} total`
        )}
        ${statCard(
          "Weekly LLM cost",
          `$${dashboard.weeklyCost.toFixed(2)}`,
          "last 7 days"
        )}
      </section>
      <section class="findings">
        <h2>Recent findings</h2>
        ${
          findings.length === 0
            ? `<div class="empty">No findings yet. Run a scan from the command palette: “DevPulse: Run scan”.</div>`
            : `<table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Severity</th>
                    <th>Collection</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>${findingsRows}</tbody>
              </table>`
        }
      </section>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DevPulse Security Dashboard</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      background: #0F172A;
      color: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter,
        Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 14px;
      line-height: 1.4;
    }
    h1 { margin: 0 0 4px 0; font-size: 22px; letter-spacing: -0.01em; }
    h2 { margin: 32px 0 12px 0; font-size: 16px; color: #CBD5E1; }
    .sub { margin: 0; color: #94A3B8; font-size: 13px; }
    .hdr {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 16px; margin-bottom: 20px;
    }
    #refresh-btn {
      background: #1E293B;
      color: #F8FAFC;
      border: 1px solid #334155;
      padding: 8px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    #refresh-btn:hover { background: #334155; }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .card {
      background: #1E293B;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 16px;
    }
    .card-label {
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 11px;
      color: #94A3B8;
      margin-bottom: 6px;
    }
    .card-value {
      font-size: 26px;
      font-weight: 600;
      color: #F8FAFC;
      margin-bottom: 4px;
    }
    .card-hint { font-size: 12px; color: #64748B; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #1E293B;
      border: 1px solid #334155;
      border-radius: 8px;
      overflow: hidden;
    }
    th, td {
      text-align: left;
      padding: 10px 14px;
      border-bottom: 1px solid #334155;
      vertical-align: middle;
    }
    thead th {
      background: #111827;
      color: #94A3B8;
      font-weight: 500;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    tbody tr:last-child td { border-bottom: 0; }
    .col-title { font-weight: 500; color: #F8FAFC; }
    .col-status { color: #94A3B8; }
    .chip {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
    }
    .empty {
      padding: 20px;
      border: 1px dashed #334155;
      border-radius: 8px;
      color: #94A3B8;
      text-align: center;
    }
    .loading, .error {
      padding: 32px;
      text-align: center;
      color: #CBD5E1;
    }
    .error h2 { color: #F87171; margin-top: 0; }
  </style>
</head>
<body>
  ${body}
  <script nonce="${nonce}">
    (function () {
      const vscode = acquireVsCodeApi();
      const btn = document.getElementById("refresh-btn");
      if (btn) {
        btn.addEventListener("click", function () {
          vscode.postMessage({ type: "refresh" });
        });
      }
    }());
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

function escapeHtml(input: unknown): string {
  const str = input == null ? "" : String(input);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
