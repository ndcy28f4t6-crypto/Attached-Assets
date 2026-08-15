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
      state      JSONB      NOT NULL,
      updated_at TIMESTAMP  NOT NULL DEFAULT NOW()
    )
  `);

  // connect-pg-simple session table: keeps sessions alive across API restarts.
  // Defined inline because the table.sql asset is not available after esbuild bundling.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid"    VARCHAR      NOT NULL COLLATE "default",
      "sess"   JSON         NOT NULL,
      "expire" TIMESTAMP(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
  `);
}

ensureSchema()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to initialize database schema");
    process.exit(1);
  });
