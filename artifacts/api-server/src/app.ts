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

// Trust reverse proxy (Render / Cloudflare / TLS proxies)
// Required for Secure cookies and correct proto/IP detection
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

// Build dynamic allowlist supporting Render domains, Replit fallback, and custom client URLs
function buildAllowedOrigins(): Set<string> {
  const origins = new Set<string>();

  // Explicit Client URL set in Render Environment Variables
  if (process.env.CLIENT_URL) {
    origins.add(process.env.CLIENT_URL.replace(/\/$/, ""));
  }

  // Render internal/external host domain fallback
  if (process.env.RENDER_EXTERNAL_URL) {
    origins.add(process.env.RENDER_EXTERNAL_URL.replace(/\/$/, ""));
  }

  // Legacy Replit domain support (if present)
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain) {
    origins.add(`https://${devDomain}`);
    const dotIdx = devDomain.indexOf(".");
    if (dotIdx !== -1) {
      const rest = devDomain.slice(dotIdx + 1);
      const replId = devDomain.slice(0, dotIdx);
      origins.add(`https://${replId}.expo.${rest}`);
    }
  }

  const expoDomain = process.env["REPLIT_EXPO_DEV_DOMAIN"];
  if (expoDomain) origins.add(`https://${expoDomain}`);

  return origins;
}

const ALLOWED_ORIGINS = buildAllowedOrigins();

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // Server-to-server or cURL/mobile native calls
      if (!origin) {
        callback(null, true);
        return;
      }
      // Local development on localhost/127.0.0.1
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        callback(null, true);
        return;
      }
      // Allowed origin check
      if (ALLOWED_ORIGINS.has(origin)) {
        callback(null, true);
        return;
      }
      // Fallback: allow request if running in dev mode
      if (process.env.NODE_ENV !== "production") {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS policy blocked access for origin: ${origin}`));
    },
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const isProduction = process.env.NODE_ENV === "production";

app.use(
  session({
    store: new PgSession({
      pool,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      sameSite: isProduction ? "none" : "lax",
      secure: isProduction,
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    },
  }),
);

app.use("/api", router);

export default app;
