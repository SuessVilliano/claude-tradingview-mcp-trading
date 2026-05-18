/**
 * Resend wrapper — sends Hybrid AI alert emails to ALERT_EMAIL.
 *
 * If RESEND_API_KEY is unset, we log to console instead so paper mode
 * still works without a billing-attached account.
 */

let _resend = null;

async function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (_resend) return _resend;
  const mod = await import("resend").catch(() => null);
  if (!mod) {
    console.warn("[email] 'resend' package not installed — falling back to console");
    return null;
  }
  _resend = new mod.Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM = process.env.ALERT_FROM ?? "Hybrid AI <onboarding@resend.dev>";

export async function sendAlert({ subject, text, html, to }) {
  const dest = to ?? process.env.ALERT_EMAIL ?? "suessvilliano@gmail.com";

  const resend = await getResend();
  if (!resend) {
    console.log(`\n[email/console] To: ${dest}\nSubject: ${subject}\n---\n${text}\n---\n`);
    return { ok: true, delivered: false };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: dest,
      subject,
      text,
      html: html ?? `<pre style="font:13px/1.5 monospace;color:#e0e0e0;background:#0b0d13;padding:16px;border-radius:8px">${escapeHtml(text)}</pre>`,
    });
    if (error) {
      console.error("[email] resend send failed", error);
      return { ok: false, error: error.message };
    }
    return { ok: true, delivered: true, id: data?.id };
  } catch (err) {
    console.error("[email] resend send threw", err);
    return { ok: false, error: err.message };
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function forwardWebhook(payload) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return { ok: true, delivered: false };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.error("[webhook-forward] failed", err);
    return { ok: false, error: err.message };
  }
}
