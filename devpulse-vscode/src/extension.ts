/**
 * DevPulse VS Code extension entrypoint.
 *
 * Architecture:
 *   - API key is stored in vscode.SecretStorage (never in settings).
 *   - DevPulseApi is the single fetch wrapper over /trpc/vscodeExtension.*.
 *   - FindingsTreeProvider + DevPulseStatusBar + HeartbeatService consume it.
 *   - `refresh` is debounced via a simple in-flight guard so rapid command
 *     invocations don't stack.
 */
import * as vscode from "vscode";
import {
  DevPulseApi,
  DevPulseApiError,
  getConfiguredBaseUrl,
  type FindingStatus,
} from "./api";
import { FindingsTreeProvider } from "./findingsProvider";
import { DevPulseStatusBar } from "./statusBar";
import { HeartbeatService } from "./heartbeat";

const SECRET_API_KEY = "devpulse.apiKey";

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  let cachedApiKey: string | undefined;
  const readApiKey = () => cachedApiKey;

  const api = new DevPulseApi(getConfiguredBaseUrl, readApiKey);
  const findingsProvider = new FindingsTreeProvider(api);
  const statusBar = new DevPulseStatusBar(api);
  const heartbeat = new HeartbeatService(api, () => Boolean(cachedApiKey));

  cachedApiKey = await context.secrets.get(SECRET_API_KEY);

  const treeView = vscode.window.createTreeView("devpulse.findings", {
    treeDataProvider: findingsProvider,
    showCollapseAll: true,
  });

  let refreshInFlight = false;
  const refresh = async () => {
    if (refreshInFlight) return;
    refreshInFlight = true;
    try {
      await Promise.all([
        findingsProvider.refresh(),
        statusBar.refresh(Boolean(cachedApiKey)),
      ]);
    } finally {
      refreshInFlight = false;
    }
  };

  const applySignedInState = async (signedIn: boolean) => {
    findingsProvider.setSignedIn(signedIn);
    await vscode.commands.executeCommand(
      "setContext",
      "devpulse.signedIn",
      signedIn
    );
    if (signedIn) {
      await refresh();
    } else {
      statusBar.showSignedOut();
    }
  };

  await applySignedInState(Boolean(cachedApiKey));

  // --- commands ----------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand("devpulse.authenticate", async () => {
      const entered = await vscode.window.showInputBox({
        title: "DevPulse API Key",
        prompt:
          "Paste your DevPulse API key (generate one from Settings → API Keys on your dashboard).",
        password: true,
        ignoreFocusOut: true,
        placeHolder: "dp_...",
        validateInput: v => (v.trim().length < 8 ? "API key looks too short" : null),
      });
      if (!entered) return;
      const key = entered.trim();

      let valid = false;
      try {
        const result = await api.validateApiKey(key);
        valid = result.valid;
        if (valid && result.user) {
          void vscode.window.showInformationMessage(
            `Signed in to DevPulse as ${result.user.email ?? result.user.name ?? "user"} (${result.user.plan}).`
          );
        }
      } catch (err) {
        const msg =
          err instanceof DevPulseApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        void vscode.window.showErrorMessage(
          `DevPulse: could not validate API key — ${msg}`
        );
        return;
      }

      if (!valid) {
        void vscode.window.showErrorMessage(
          "DevPulse: API key rejected. Generate a new one from the dashboard."
        );
        return;
      }

      await context.secrets.store(SECRET_API_KEY, key);
      cachedApiKey = key;
      await applySignedInState(true);
    }),

    vscode.commands.registerCommand("devpulse.signOut", async () => {
      await context.secrets.delete(SECRET_API_KEY);
      cachedApiKey = undefined;
      await applySignedInState(false);
      void vscode.window.showInformationMessage("DevPulse: signed out.");
    }),

    vscode.commands.registerCommand("devpulse.refresh", async () => {
      await refresh();
    }),

    vscode.commands.registerCommand("devpulse.openDashboard", async () => {
      const base = getConfiguredBaseUrl().replace(/\/+$/, "");
      void vscode.env.openExternal(vscode.Uri.parse(base));
    }),

    vscode.commands.registerCommand("devpulse.runScan", async () => {
      if (!cachedApiKey) {
        void vscode.window.showWarningMessage(
          "DevPulse: sign in with an API key first."
        );
        return;
      }
      let collections: { id: string; name: string }[] = [];
      try {
        collections = await api.listCollections();
      } catch (err) {
        void vscode.window.showErrorMessage(
          `DevPulse: could not load collections — ${errMessage(err)}`
        );
        return;
      }
      if (collections.length === 0) {
        void vscode.window.showInformationMessage(
          "DevPulse: you don't have any collections yet. Create one from the dashboard first."
        );
        return;
      }
      const picked = await vscode.window.showQuickPick(
        collections.map(c => ({
          label: c.name,
          description: c.id,
          collectionId: c.id,
        })),
        { title: "DevPulse: pick a collection to scan" }
      );
      if (!picked) return;
      try {
        const scan = await api.triggerScan(picked.collectionId);
        void vscode.window.showInformationMessage(
          `DevPulse: scan queued (id ${scan.scanId}).`
        );
        await refresh();
      } catch (err) {
        void vscode.window.showErrorMessage(
          `DevPulse: scan failed — ${errMessage(err)}`
        );
      }
    }),

    vscode.commands.registerCommand(
      "devpulse.markFindingResolved",
      async (node: unknown) => updateFindingStatusCmd(node, "resolved")
    ),
    vscode.commands.registerCommand(
      "devpulse.markFindingInProgress",
      async (node: unknown) => updateFindingStatusCmd(node, "in-progress")
    )
  );

  async function updateFindingStatusCmd(
    node: unknown,
    status: FindingStatus
  ): Promise<void> {
    const findingId = extractFindingId(node);
    if (!findingId) {
      void vscode.window.showWarningMessage(
        "DevPulse: could not determine finding from selection."
      );
      return;
    }
    try {
      await api.updateFindingStatus(findingId, status);
      await refresh();
    } catch (err) {
      void vscode.window.showErrorMessage(
        `DevPulse: could not update finding — ${errMessage(err)}`
      );
    }
  }

  // --- lifecycle ---------------------------------------------------------

  context.subscriptions.push(
    treeView,
    statusBar,
    { dispose: () => heartbeat.stop() },
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("devpulse.apiUrl")) {
        void refresh();
      }
      if (
        e.affectsConfiguration("devpulse.heartbeatIntervalSec") ||
        e.affectsConfiguration("devpulse.trackFileChanges")
      ) {
        heartbeat.stop();
        heartbeat.start();
      }
    })
  );

  heartbeat.start();
}

export function deactivate(): void {
  /* lifecycle cleanup is handled via context.subscriptions */
}

function errMessage(err: unknown): string {
  if (err instanceof DevPulseApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function extractFindingId(node: unknown): string | null {
  if (node && typeof node === "object") {
    const maybe = node as Record<string, unknown>;
    if (
      "finding" in maybe &&
      maybe.finding &&
      typeof maybe.finding === "object" &&
      "id" in (maybe.finding as Record<string, unknown>)
    ) {
      const id = (maybe.finding as Record<string, unknown>).id;
      if (typeof id === "string") return id;
    }
    if ("id" in maybe && typeof maybe.id === "string") {
      return maybe.id;
    }
  }
  return null;
}
