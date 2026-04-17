# DevPulse for VS Code

Monitor DevPulse security findings, LLM cost, and scan status directly in your editor.

## Features

- **Findings tree view** grouped by severity (Critical / High / Medium / Low) with inline actions to mark findings in-progress or resolved.
- **Status bar item** showing open findings count and weekly LLM spend.
- **Run scan** command that queues a new scan for one of your collections.
- **Activity heartbeat** that reports editor activity to the DevPulse backend (opt-out via settings).
- **API-key authentication** — generate a key from the DevPulse dashboard, paste it into VS Code, done.

## Setup

1. Run **DevPulse: Sign in with API Key** from the Command Palette.
2. Paste a key generated from your DevPulse dashboard (Settings → API Keys). The key is stored in VS Code's `SecretStorage`.
3. Point the extension at your DevPulse backend via the `devpulse.apiUrl` setting if you're self-hosting.

## Commands

| Command                          | Description                                      |
| -------------------------------- | ------------------------------------------------ |
| `DevPulse: Sign in with API Key` | Save your API key into VS Code's secret storage. |
| `DevPulse: Sign out`             | Remove the saved API key.                        |
| `DevPulse: Refresh`              | Re-fetch findings and dashboard summary.         |
| `DevPulse: Run scan`             | Queue a scan for a selected collection.          |
| `DevPulse: Open dashboard`       | Open the DevPulse web dashboard.                 |

## Settings

| Setting                         | Default                 | Description                                                      |
| ------------------------------- | ----------------------- | ---------------------------------------------------------------- |
| `devpulse.apiUrl`               | `http://localhost:3000` | Base URL of your DevPulse backend.                               |
| `devpulse.heartbeatIntervalSec` | `120`                   | Seconds between heartbeats. Set `0` to disable.                  |
| `devpulse.trackFileChanges`     | `true`                  | Send `file_change` activity events (filename only, no contents). |

## Privacy

This extension sends a minimal activity stream to the configured DevPulse backend so dashboards stay accurate:

- **heartbeat** — empty payload, periodic.
- **file_change** — relative file path only (no contents, no diffs).
- **session_start** / **session_end** — timestamps.

No source code, buffer contents, or git history leave your machine. Disable activity entirely by setting `devpulse.heartbeatIntervalSec` to `0`.

## Building from source

```bash
cd devpulse-vscode
npm install
npm run compile
```

Load the `devpulse-vscode/` folder via **Extensions: Install from VSIX...** or **Run Extension** in the debug panel.

## License

MIT
