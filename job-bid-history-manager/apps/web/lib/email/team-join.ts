import { appBaseUrl, sendResendEmail } from "@/lib/email/resend";

export async function sendTeamJoinRequestEmail(opts: {
  ownerEmail: string;
  requesterEmail: string;
  teamName: string;
  requestId: string;
  approveToken: string;
}): Promise<void> {
  const base = appBaseUrl();
  const approveUrl = `${base}/team-join/approve?request_id=${encodeURIComponent(opts.requestId)}&token=${encodeURIComponent(opts.approveToken)}`;

  const html = `
    <p>Someone requested to join your Job Bid History team <strong>${escapeHtml(opts.teamName)}</strong>.</p>
    <p><strong>Requester:</strong> ${escapeHtml(opts.requesterEmail)}</p>
    <p style="margin:24px 0">
      <a href="${approveUrl}" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
        Confirm join request
      </a>
    </p>
    <p style="color:#64748b;font-size:14px">This link expires in 48 hours. You must be signed in as the team owner to approve.</p>
  `.trim();

  await sendResendEmail({
    to: opts.ownerEmail,
    subject: "Request to join your Job Bid History team",
    html,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
