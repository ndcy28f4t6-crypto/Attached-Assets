import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import router from "./routes";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set");
}

const PgSession = connectPgSimple(session);

const app: Express = express();

// Trust the Replit TLS-terminating proxy so Express sees the connection as HTTPS.
// Required for Secure cookies to be set correctly behind the proxy.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Build an exact allowlist of this app's own origins from Replit environment variables.
// Only this specific repl's dev domains are permitted — not any *.replit.dev origin —
// so other Replit apps cannot make credentialed requests to this API.
function buildAllowedOrigins(): Set<string> {
  const origins = new Set<string>();
  // Localhost for direct curl / integration tests
  origins.add("http://localhost");
  // Primary dev domain (web app + shared proxy)
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain) {
    origins.add(`https://${devDomain}`);
    // Expo web preview is at <replId>.expo.<rest>, derived from devDomain
    const dotIdx = devDomain.indexOf(".");
    if (dotIdx !== -1) {
      const rest = devDomain.slice(dotIdx + 1); // e.g. "janeway.replit.dev"
      const replId = devDomain.slice(0, dotIdx);
      origins.add(`https://${replId}.expo.${rest}`);
    }
  }
  // Expo dev domain if provided explicitly
  const expoDomain = process.env["REPLIT_EXPO_DEV_DOMAIN"];
  if (expoDomain) origins.add(`https://${expoDomain}`);
  return origins;
}

const ALLOWED_ORIGINS = buildAllowedOrigins();

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // No origin header = server-to-server or curl — allow through
      if (!origin) { callback(null, true); return; }
      // Allow localhost with any port
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) { callback(null, true); return; }
      // Allow only this app's specific dev origins
      callback(null, ALLOWED_ORIGINS.has(origin));
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Anonymous session persisted to PostgreSQL so identity survives API restarts.
// The "session" table is created in ensureSchema() at startup (index.ts).
app.use(
  session({
    store: new PgSession({
      pool,
      // Do not use createTableIfMissing — the table.sql asset is not available
      // after esbuild bundling. ensureSchema() in index.ts handles creation instead.
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true, // ensures req.sessionID is always stable on first request
    cookie: {
      httpOnly: true,
      // "none" + secure is required for cross-origin cookie sending (Expo web preview
      // is on a different subdomain than the API server).
      sameSite: "none",
      secure: true,
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    },
  }),
);

app.use("/api", router);

export default app;
