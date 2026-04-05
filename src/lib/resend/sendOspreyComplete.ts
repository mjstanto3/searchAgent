import { Resend } from 'resend';

function getResend() {
  return new Resend(process.env.RESEND_API_KEY!);
}

interface SendOspreyCompleteEmailParams {
  to: string;
  jobId: string;
  originalFileName: string;
  totalRows: number;
  rowsCompleted: number;
  questionsAnswered: number;
  creditsUsed: number;
  downloadUrl: string;
  downloadExpiresAt: string;
}

export async function sendOspreyCompleteEmail(params: SendOspreyCompleteEmailParams) {
  const {
    to,
    jobId,
    originalFileName,
    totalRows,
    rowsCompleted,
    questionsAnswered,
    creditsUsed,
    downloadUrl,
    downloadExpiresAt,
  } = params;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://localhost:3000';

  await getResend().emails.send({
    from: `Osprey <no-reply@${process.env.EMAIL_FROM_DOMAIN ?? 'resend.dev'}>`,
    to,
    subject: `Your Osprey enrichment is ready — ${originalFileName}`,
    html: `
      <h2>Your Osprey enrichment is complete</h2>
      <p>Your batch research job has finished. Here's a summary:</p>
      <ul>
        <li><strong>File:</strong> ${originalFileName}</li>
        <li><strong>Rows processed:</strong> ${rowsCompleted} of ${totalRows}</li>
        <li><strong>Questions answered per row:</strong> ${questionsAnswered}</li>
        <li><strong>Credits used:</strong> ${creditsUsed}</li>
      </ul>
      <p>
        <a href="${downloadUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
          Download Enriched File
        </a>
      </p>
      <p style="color:#6b7280;font-size:14px;">
        This download link expires on ${downloadExpiresAt}. 
        You can also access it from your <a href="${appUrl}/osprey/jobs/${jobId}">job page</a>.
      </p>
    `,
  });
}
