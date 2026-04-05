import { Resend } from 'resend';
import type { Monitor, Run } from '@/types';

function getResend() {
  return new Resend(process.env.RESEND_API_KEY!);
}

export async function sendBriefEmail(
  toEmail: string,
  monitor: Monitor,
  run: Run,
): Promise<void> {
  if (!run.brief_html || !run.brief_markdown) {
    throw new Error('No brief content to send');
  }

  const subject = `Your ${monitor.frequency} brief: ${monitor.name}`;
  const fromAddress = process.env.RESEND_FROM_EMAIL ?? 'briefs@yourdomain.com';

  const html = buildEmailHtml(monitor, run);

  await getResend().emails.send({
    from: fromAddress,
    to: toEmail,
    subject,
    html,
    text: run.brief_markdown,
  });
}

function buildEmailHtml(monitor: Monitor, run: Run): string {
  const date = new Date(run.created_at).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${monitor.name} – Research Brief</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 0; }
    .container { max-width: 680px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { background: #0f172a; padding: 32px 40px; }
    .header h1 { color: #ffffff; font-size: 24px; margin: 0 0 4px; }
    .header p { color: #94a3b8; font-size: 14px; margin: 0; }
    .badge { display: inline-block; background: #6366f1; color: white; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    .body { padding: 40px; color: #1e293b; line-height: 1.7; }
    .body h2 { font-size: 18px; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 32px; }
    .body ul { padding-left: 20px; }
    .body li { margin-bottom: 8px; }
    .body a { color: #6366f1; text-decoration: none; }
    .footer { background: #f1f5f9; padding: 24px 40px; text-align: center; font-size: 12px; color: #64748b; }
    .footer a { color: #6366f1; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="badge">${monitor.frequency} brief</span>
      <h1>${monitor.name}</h1>
      <p>${date}</p>
    </div>
    <div class="body">
      ${run.brief_html}
    </div>
    <div class="footer">
      <p>You're receiving this because you set up a monitor on <strong>SearchAgent</strong>.</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/magpie">Manage your monitors</a></p>
    </div>
  </div>
</body>
</html>`;
}
