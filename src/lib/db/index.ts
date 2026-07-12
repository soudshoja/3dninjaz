import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

// Reuse a single pool across hot-reloads in dev so we don't exhaust the
// cPanel MySQL connection limit. In production, Next.js serverless workers
// will each create their own pool on first import.
declare global {
  // eslint-disable-next-line no-var
  var __mysqlPool: mysql.Pool | undefined;
}

// SSL is intentionally NOT configured — the Node app and the MariaDB 10.11
// instance share the same cPanel host (loopback only), so TLS would add
// handshake cost for no threat-model benefit.
function buildPool(): mysql.Pool {
  const url = process.env.DATABASE_URL;
  if (url && url.startsWith("mysql://")) {
    return mysql.createPool({
      uri: url,
      connectionLimit: 10,
      waitForConnections: true,
      charset: "utf8mb4",
    });
  }

  // Fallback to discrete env vars if DATABASE_URL is missing.
  return mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
    waitForConnections: true,
    charset: "utf8mb4",
  });
}

const pool = global.__mysqlPool ?? buildPool();
if (process.env.NODE_ENV !== "production") {
  global.__mysqlPool = pool;
}

export const db = drizzle(pool, { schema, mode: "default" });
export { pool };

// Phase 23 (23-03) — additive only, below this line. Compat flag. Default
// "single" = today's behavior, Host ignored, one tenant synthesized from
// DATABASE_URL. "registry" activates Host-based resolution (dev only until
// Phase 27 cutover).
export const TENANT_MODE = (process.env.TENANT_MODE ?? "single") as
  | "single"
  | "registry";

// Re-export the platform accessor so callers have one import path. This is a
// plain function reference, not a call — getPlatformDb stays lazy in
// pool-manager.ts so single-mode boots without PLATFORM_DATABASE_URL set.
export { getPlatformDb } from "@/lib/tenant/pool-manager";
