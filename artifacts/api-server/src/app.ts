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
app.use(cors({ credentials: true }));
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
      sameSite: "lax",
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    },
  }),
);

app.use("/api", router);

export default app;
