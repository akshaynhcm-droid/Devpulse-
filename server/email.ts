/**
 * Email Service
 * Uses nodemailer with SMTP for real email delivery.
 * Falls back to console logging when SMTP is not configured.
 */
import nodemailer from "nodemailer";

interface TeamInviteEmailOptions {
  toEmail: string;
  inviterName: string;
  role: "admin" | "editor" | "viewer";
}

function createTransport() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587");
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || "noreply@devpulse.app";

  if (!smtpHost || !smtpUser || !smtpPass) {
    return null; // No SMTP configured
  }

  return { transport: nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  }), from: smtpFrom };
}

export async function sendTeamInviteEmail(opts: TeamInviteEmailOptions): Promise<void> {
  const appUrl = process.env.APP_URL || "https://devpulse.app";
  const subject = `You've been invited to DevPulse by ${opts.inviterName}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>DevPulse Invitation</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background:#f9fafb; margin:0; padding:40px 0;">
  <div style="max-width:520px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8); padding:32px; text-align:center;">
      <h1 style="color:#fff; margin:0; font-size:24px; letter-spacing:-0.5px;">DevPulse</h1>
      <p style="color:#bfdbfe; margin:8px 0 0; font-size:14px;">API Security & LLM Intelligence Platform</p>
    </div>
    <div style="padding:40px 32px;">
      <h2 style="color:#111827; font-size:20px; margin:0 0 16px;">You've been invited!</h2>
      <p style="color:#374151; line-height:1.6; margin:0 0 24px;">
        <strong>${opts.inviterName}</strong> has invited you to join their DevPulse workspace as a <strong>${opts.role}</strong>.
      </p>
      <div style="background:#f3f4f6; border-radius:8px; padding:16px; margin:0 0 28px;">
        <p style="color:#6b7280; font-size:13px; margin:0 0 4px; text-transform:uppercase; letter-spacing:0.5px; font-weight:600;">Your Role</p>
        <p style="color:#111827; font-size:18px; font-weight:700; margin:0; text-transform:capitalize;">${opts.role}</p>
        <p style="color:#6b7280; font-size:12px; margin:6px 0 0;">
          ${opts.role === "admin" ? "Full access to all features and team management" :
            opts.role === "editor" ? "Manage collections, run scans, and view reports" :
            "Read-only access to collections and reports"}
        </p>
      </div>
      <a href="${appUrl}" style="display:block; background:#2563eb; color:#fff; text-decoration:none; padding:14px 24px; border-radius:8px; text-align:center; font-weight:600; font-size:16px;">
        Accept Invitation →
      </a>
      <p style="color:#9ca3af; font-size:12px; margin:24px 0 0; text-align:center;">
        If you weren't expecting this invitation, you can safely ignore this email.
      </p>
    </div>
    <div style="background:#f9fafb; border-top:1px solid #e5e7eb; padding:20px 32px; text-align:center;">
      <p style="color:#9ca3af; font-size:12px; margin:0;">
        © ${new Date().getFullYear()} DevPulse. API Security Made Simple.
      </p>
    </div>
  </div>
</body>
</html>`;

  const config = createTransport();

  if (!config) {
    // Log to console when SMTP not configured (dev mode)
    console.log(`[Email] SMTP not configured. Would have sent invite to: ${opts.toEmail}`);
    console.log(`[Email] Subject: ${subject}`);
    return;
  }

  await config.transport.sendMail({
    from: `"DevPulse" <${config.from}>`,
    to: opts.toEmail,
    subject,
    html,
  });

  console.log(`[Email] Invite sent to ${opts.toEmail}`);
}
