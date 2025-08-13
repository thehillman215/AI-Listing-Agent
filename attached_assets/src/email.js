import { Resend } from "resend";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SENDER_EMAIL = process.env.SENDER_EMAIL || "no-reply@example.com";

export async function sendResultsEmail({ to, subject, html, attachments = [] }) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
  const resend = new Resend(RESEND_API_KEY);
  const r = await resend.emails.send({
    from: SENDER_EMAIL,
    to,
    subject,
    html,
    attachments
  });
  return r;
}
