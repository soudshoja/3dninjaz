import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import type { Tenant } from "@/lib/tenant/platform-schema";
import { getMailer, MAIL_FROM } from "@/lib/mailer";

// ============================================================================
// Phase 24 (24-01) — Per-tenant mailer cache.
//
// Under TENANT_MODE=single (the deployed default) getTenantMailer reuses
// today's single src/lib/mailer global transport — zero new transports,
// zero behavior change. Once TENANT_MODE=registry is flipped (dev-only
// until Phase 27), each tenant gets its own lazily-created nodemailer
// transport, built from `tenant.settings.smtp` overrides if present, else
// the platform SMTP_* env (the same values getMailer() uses) — so a
// registry-mode tenant with no SMTP override behaves like the platform
// transport.
//
// No LRU eviction here (unlike pool-manager.ts's TENANT_POOL_MAX) —
// nodemailer transports don't hold a persistent connection open between
// sends and the tenant fleet is small. Revisit with an eviction cap in
// Phase 25 if the fleet grows large enough for this to matter.
// ============================================================================

const SINGLE_TENANT_ID = "single";

// Hot-reload-safe module singleton — mirrors pool-manager.ts's
// __tenantPools pattern. Without this, `next dev` hot reloads would
// re-create every tenant transport on each edit.
declare global {
  // eslint-disable-next-line no-var
  var __tenantMailers: Map<string, Transporter> | undefined;
}

const tenantMailers: Map<string, Transporter> =
  global.__tenantMailers ?? new Map();
if (process.env.NODE_ENV !== "production") {
  global.__tenantMailers = tenantMailers;
}

interface TenantSmtpSettings {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
}

function readTenantSmtpSettings(tenant: Tenant): TenantSmtpSettings {
  const raw = tenant.settings.smtp;
  if (!raw || typeof raw !== "object") return {};
  const s = raw as Record<string, unknown>;
  return {
    host: typeof s.host === "string" ? s.host : undefined,
    port: typeof s.port === "number" ? s.port : undefined,
    user: typeof s.user === "string" ? s.user : undefined,
    password: typeof s.password === "string" ? s.password : undefined,
  };
}

function buildTenantTransport(tenant: Tenant): Transporter {
  const overrides = readTenantSmtpSettings(tenant);
  const host = overrides.host ?? process.env.SMTP_HOST;
  const port = overrides.port ?? Number(process.env.SMTP_PORT ?? 587);
  const user = overrides.user ?? process.env.SMTP_USER;
  const pass = overrides.password ?? process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    console.warn(
      `[mailer-cache] SMTP config incomplete for tenant ${tenant.id}. Emails will fail until tenant.settings.smtp or the platform SMTP_* env is set.`,
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // STARTTLS on 587, implicit TLS on 465
    auth: user && pass ? { user, pass } : undefined,
  });
}

/**
 * Lazy per-tenant nodemailer transport.
 *
 * Single-mode short-circuit (TENANT_MODE !== "registry", or the synthesized
 * single tenant's id): returns the EXISTING src/lib/mailer global transport
 * untouched — no transport is created, no behavior changes from today.
 */
export function getTenantMailer(tenant: Tenant): Transporter {
  if (process.env.TENANT_MODE !== "registry" || tenant.id === SINGLE_TENANT_ID) {
    return getMailer();
  }

  const existing = tenantMailers.get(tenant.id);
  if (existing) return existing;

  const transport = buildTenantTransport(tenant);
  tenantMailers.set(tenant.id, transport);
  return transport;
}

/**
 * Resolves the From address for a tenant's outbound mail.
 *
 * Single mode / no override: returns today's exact MAIL_FROM constant
 * value. Registry mode with a `settings.mailFrom` override: returns it;
 * else falls back to MAIL_FROM.
 */
export function getTenantMailFrom(tenant: Tenant): string {
  if (process.env.TENANT_MODE !== "registry" || tenant.id === SINGLE_TENANT_ID) {
    return MAIL_FROM;
  }
  const mailFrom = tenant.settings.mailFrom;
  return typeof mailFrom === "string" && mailFrom.length > 0 ? mailFrom : MAIL_FROM;
}
