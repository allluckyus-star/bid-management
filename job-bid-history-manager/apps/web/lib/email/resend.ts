type SendEmailOpts = {
  to: string;
  subject: string;
  html: string;
};

export async function sendResendEmail(opts: SendEmailOpts): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const from = process.env.RESEND_FROM_EMAIL?.trim() ?? "Job Bid History <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend failed (${res.status}): ${body}`);
  }
}

export function appBaseUrl(): string {
  const base = process.env.APP_BASE_URL?.trim();
  if (!base) {
    throw new Error("APP_BASE_URL is not configured");
  }
  return base.replace(/\/$/, "");
}
