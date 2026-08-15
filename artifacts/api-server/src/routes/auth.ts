import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { pool } from "@workspace/db";
import {
  buildAuthUrl,
  exchangeCode,
  fetchGoogleUserInfo,
} from "../lib/googleAuth.js";

const router: IRouter = Router();

function getRedirectUri(req: Parameters<typeof router.get>[1] extends (req: infer R, ...rest: unknown[]) => unknown ? R : never): string {
  // Prefer the explicit dev-domain env var so the redirect URI is stable.
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) return `https://${devDomain}/api/auth/google/callback`;
  // Fallback: derive from the incoming request
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  return `https://${host}/api/auth/google/callback`;
}

/** GET /api/auth/google/start — redirect the browser to Google's OAuth screen */
router.get("/auth/google/start", (req, res): void => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    res.status(503).json({ error: "Google OAuth credentials are not configured" });
    return;
  }
  const state = crypto.randomBytes(16).toString("hex");
  req.session.googleOAuthState = state;
  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Session save failed" });
      return;
    }
    res.redirect(buildAuthUrl(state, getRedirectUri(req)));
  });
});

/** GET /api/auth/google/callback — handle the OAuth code exchange */
router.get("/auth/google/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error) {
    res.redirect("/#/me?error=google_denied");
    return;
  }

  const expectedState = req.session.googleOAuthState;
  if (!state || state !== expectedState) {
    res.status(400).json({ error: "Invalid OAuth state" });
    return;
  }
  // Clear the CSRF token — it's single-use
  req.session.googleOAuthState = undefined;

  if (!code) {
    res.status(400).json({ error: "Missing authorization code" });
    return;
  }

  try {
    const tokens = await exchangeCode(code, getRedirectUri(req));
    const userInfo = await fetchGoogleUserInfo(tokens.accessToken);

    // Upsert the account row; refresh_token is only present on first consent,
    // so only update it when a new one arrives.
    await pool.query(
      `INSERT INTO calendar_accounts
         (session_id, google_sub, email, access_token, refresh_token, token_expiry)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_id, google_sub) DO UPDATE SET
         email        = EXCLUDED.email,
         access_token = EXCLUDED.access_token,
         token_expiry = EXCLUDED.token_expiry,
         refresh_token = COALESCE(EXCLUDED.refresh_token, calendar_accounts.refresh_token)`,
      [
        req.sessionID,
        userInfo.sub,
        userInfo.email,
        tokens.accessToken,
        tokens.refreshToken,
        tokens.expiresAt.toISOString(),
      ],
    );

    res.redirect("/#/me?connected=1");
  } catch (err) {
    req.log.error({ err }, "Google OAuth callback error");
    res.redirect("/#/me?error=google_auth_failed");
  }
});

/** GET /api/auth/accounts — list connected Google accounts for this session */
router.get("/auth/accounts", async (req, res): Promise<void> => {
  try {
    const result = await pool.query<{ id: number; email: string }>(
      "SELECT id, email FROM calendar_accounts WHERE session_id = $1 ORDER BY created_at",
      [req.sessionID],
    );
    res.json(result.rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list accounts");
    res.status(500).json({ error: "Failed to list accounts" });
  }
});

/** DELETE /api/auth/accounts/:id — disconnect a specific Google account */
router.delete("/auth/accounts/:id", async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid account id" });
    return;
  }
  try {
    await pool.query(
      "DELETE FROM calendar_accounts WHERE id = $1 AND session_id = $2",
      [id, req.sessionID],
    );
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Failed to delete account");
    res.status(500).json({ error: "Failed to delete account" });
  }
});

export default router;
