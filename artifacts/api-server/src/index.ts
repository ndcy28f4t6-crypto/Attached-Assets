import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Ensure all required tables exist on every startup.
// These statements are idempotent and safe to run on fresh databases.
async function ensureSchema(): Promise<void> {
  // App state table: one JSONB blob per anonymous session
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      session_id TEXT PRIMARY KEY,
      state     JSONB       NOT NULL,
      revision  INTEGER     NOT NULL DEFAULT 0,
      updated_at TIMESTAMP   NOT NULL DEFAULT NOW()
    )
  `);

  // Self-healing migration for existing sessions
  await pool.query(`
    ALTER TABLE app_state
    ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0
  `);

  // connect-pg-simple session table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid"     VARCHAR      NOT NULL COLLATE "default",
      "sess"    JSON         NOT NULL,
      "expire"  TIMESTAMP(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    )
  `);
  
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
  `);

  // Google Calendar OAuth tokens
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_accounts (
      id            SERIAL PRIMARY KEY,
      session_id    TEXT        NOT NULL REFERENCES "session"(sid) ON DELETE CASCADE,
      google_sub    TEXT        NOT NULL,
      email         TEXT        NOT NULL,
      access_token  TEXT        NOT NULL,
      refresh_token TEXT,
      token_expiry  TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uniq_session_google_sub UNIQUE (session_id, google_sub)
    )
  `);
}

async function startServer(): Promise<void> {
  try {
    await ensureSchema();
    logger.info("Database schema initialized successfully.");

    const server = app.listen(port, "0.0.0.0", () => {
      logger.info({ port, host: "0.0.0.0" }, "Server listening successfully");
    });

    server.on("error", (err) => {
      logger.error({ err }, "Error starting HTTP server");
      process.exit(1);
    });
  } catch (err) {
    logger.error({ err }, "Failed to initialize database schema or start server");
    process.exit(1);
  }
}

startServer();
