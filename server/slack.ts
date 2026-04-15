/**
 * Slack Integration
 * Sends notifications to Slack via webhook for critical events like kill switch triggers.
 * Silently skips if SLACK_WEBHOOK_URL is not configured.
 */

interface KillSwitchAlertOptions {
  userId: number;
  userName: string;
  reason: string;
  currentSpend: number;
  budgetLimit: number;
}

export async function sendSlackKillSwitchAlert(opts: KillSwitchAlertOptions): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log(`[Slack] Webhook not configured. Kill switch triggered by user ${opts.userId} (${opts.userName}): ${opts.reason}`);
    return;
  }

  const percentUsed = opts.budgetLimit > 0
    ? Math.round((opts.currentSpend / opts.budgetLimit) * 100)
    : 0;

  const payload = {
    text: "🚨 *DevPulse Kill Switch Triggered*",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🚨 Kill Switch Triggered",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*User:*\n${opts.userName} (ID: ${opts.userId})`,
          },
          {
            type: "mrkdwn",
            text: `*Time:*\n${new Date().toUTCString()}`,
          },
          {
            type: "mrkdwn",
            text: `*Current Spend:*\n$${opts.currentSpend.toFixed(2)} / $${opts.budgetLimit.toFixed(2)} (${percentUsed}%)`,
          },
          {
            type: "mrkdwn",
            text: `*Status:*\n⛔ All LLM operations BLOCKED`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Reason:*\n${opts.reason}`,
        },
      },
      {
        type: "divider",
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "To re-enable LLM operations, go to DevPulse → Kill Switch → Reset",
          },
        ],
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook returned ${response.status}: ${await response.text()}`);
  }

  console.log(`[Slack] Kill switch alert sent for user ${opts.userId}`);
}
