import nodemailer, { type Transporter } from "nodemailer";
import type { Tenant } from "@/lib/tenant/platform-schema";

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

/**
 * Resolves the transport + From address for an outbound send.
 *
 * Phase 24 (24-01): `tenant` undefined -> today's exact global transport +
 * MAIL_FROM (the byte-identical single-mode / pre-Wave-2-caller path).
 * `tenant` provided -> routed through the per-tenant mailer cache
 * (src/lib/tenant/mailer-cache.ts), which itself short-circuits back to
 * this same global transport under TENANT_MODE=single. Dynamic import
 * avoids a static circular import (mailer-cache.ts imports getMailer/
 * MAIL_FROM from this module).
 */
async function resolveSender(
  tenant?: Tenant,
): Promise<{ transport: Transporter; from: string }> {
  if (!tenant) {
    return { transport: getMailer(), from: MAIL_FROM };
  }
  const { getTenantMailer, getTenantMailFrom } = await import(
    "@/lib/tenant/mailer-cache"
  );
  return { transport: getTenantMailer(tenant), from: getTenantMailFrom(tenant) };
}

export async function sendResetPasswordEmail(opts: {
  to: string;
  name: string;
  url: string;
  tenant?: Tenant;
}): Promise<void> {
  // Plan 05-06: render via DB-backed template. Fallback to legacy hardcoded
  // body if template render fails (DB hiccup must not block password reset).
  let subject: string;
  let html: string;
  let text: string | undefined;
  try {
    const { renderTemplate } = await import("@/lib/email/templates");
    const rendered = await renderTemplate("password_reset", {
      customer_name: opts.name,
      reset_link: opts.url,
    });
    subject = rendered.subject;
    html = rendered.html;
    text = rendered.text;
  } catch (err) {
    console.warn(
      "[mailer] DB template render failed, using legacy reset body:",
      err,
    );
    subject = "Reset your 3D Ninjaz password";
    html = `
        <p>Hi ${opts.name},</p>
        <p>Click <a href="${opts.url}">here</a> to reset your password. This link expires in 1 hour.</p>
        <p>If you did not request this, ignore this email.</p>
      `;
    text = undefined;
  }
  try {
    const { transport, from } = await resolveSender(opts.tenant);
    await transport.sendMail({
      from,
      to: opts.to,
      subject,
      html,
      text,
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
  tenant?: Tenant;
}): Promise<void> {
  const { transport, from } = await resolveSender(opts.tenant);
  await transport.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}
