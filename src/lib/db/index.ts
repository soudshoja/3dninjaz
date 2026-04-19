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

function buildPool(): mysql.Pool {
  const url = process.env.DATABASE_URL;
  if (url && url.startsWith("mysql://")) {
    return mysql.createPool({
      uri: url,
      connectionLimit: 10,
      waitForConnections: true,
      // cPanel MySQL accepts only ASCII-clean passwords we provisioned, so
      // no special charset handling is needed beyond the default utf8mb4.
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
  });
}

const pool = global.__mysqlPool ?? buildPool();
if (process.env.NODE_ENV !== "production") {
  global.__mysqlPool = pool;
}

export const db = drizzle(pool, { schema, mode: "default" });
export { pool };
