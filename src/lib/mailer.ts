import nodemailer, { type Transporter } from "nodemailer";

/**
 * Nodemailer transport backed by the cPanel SMTP mailbox created on
 * 3dninjaz.com (replaces Resend). Reuse a single transport across hot-reloads
 * in development so we don't open a new TCP connection per email.
 */
declare global {
  // eslint-disable-next-line no-var
  var __mailTransport: Transporter | undefined;
}

function buildTransport(): Transporter {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    // Surface a clear error early — silently returning a no-op transport
    // would hide misconfiguration until a password-reset attempt.
    console.warn(
      "[mailer] SMTP env vars missing. Emails will fail until SMTP_HOST, SMTP_USER, SMTP_PASSWORD are set."
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // STARTTLS on 587, implicit TLS on 465
    auth: user && pass ? { user, pass } : undefined,
  });
}

export function getMailer(): Transporter {
  if (!global.__mailTransport) {
    global.__mailTransport = buildTransport();
  }
  return global.__mailTransport;
}

export const MAIL_FROM =
  process.env.SMTP_FROM ?? "3D Ninjaz <noreply@3dninjaz.com>";

export async function sendResetPasswordEmail(opts: {
  to: string;
  name: string;
  url: string;
}): Promise<void> {
  try {
    await getMailer().sendMail({
      from: MAIL_FROM,
      to: opts.to,
      subject: "Reset your 3D Ninjaz password",
      html: `
        <p>Hi ${opts.name},</p>
        <p>Click <a href="${opts.url}">here</a> to reset your password. This link expires in 1 hour.</p>
        <p>If you did not request this, ignore this email.</p>
      `,
    });
  } catch (err) {
    console.error("[mailer] Failed to send reset password email:", err);
  }
}

export async function sendMail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  await getMailer().sendMail({
    from: MAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}
