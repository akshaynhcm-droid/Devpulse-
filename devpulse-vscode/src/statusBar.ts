import * as vscode from "vscode";
import type { DevPulseApi, DashboardData } from "./api";

/**
 * Status bar item showing DevPulse health at a glance.
 *   - not signed in  : "$(shield) DevPulse: Sign in"
 *   - signed in ok   : "$(shield) DevPulse · 3 open · $12.40/wk"
 *   - error          : "$(alert) DevPulse: Error"
 */
export class DevPulseStatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor(private readonly api: DevPulseApi) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.name = "DevPulse";
    this.item.command = "devpulse.openDashboard";
  }

  dispose(): void {
    this.item.dispose();
  }

  showSignedOut(): void {
    this.item.text = "$(shield) DevPulse: Sign in";
    this.item.tooltip = "Click or run 'DevPulse: Sign in with API Key'";
    this.item.command = "devpulse.authenticate";
    this.item.show();
  }

  showError(message: string): void {
    this.item.text = "$(alert) DevPulse";
    this.item.tooltip = `DevPulse error: ${message}`;
    this.item.command = "devpulse.refresh";
    this.item.show();
  }

  showSummary(data: DashboardData): void {
    const open = data.openFindings;
    const cost = data.weeklyCost;
    this.item.text = `$(shield) DevPulse · ${open} open · $${cost.toFixed(2)}/wk`;
    this.item.tooltip = [
      `Collections: ${data.collections}`,
      `Open findings: ${open}`,
      `Recent scans: ${data.recentScans}`,
      `Weekly LLM spend: $${cost.toFixed(2)}`,
      data.lastScanAt ? `Last scan: ${data.lastScanAt}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    this.item.command = "devpulse.openDashboard";
    this.item.show();
  }

  async refresh(isSignedIn: boolean): Promise<void> {
    if (!isSignedIn) {
      this.showSignedOut();
      return;
    }
    try {
      const data = await this.api.getDashboardData();
      this.showSummary(data);
    } catch (err) {
      this.showError(err instanceof Error ? err.message : String(err));
    }
  }
}
