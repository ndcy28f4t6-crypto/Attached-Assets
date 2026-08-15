import { pool } from "@workspace/db";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

export function buildAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent select_account",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export type GoogleTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
};

export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<GoogleTokens> {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${body}`);
  }
  const data = (await resp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function fetchGoogleUserInfo(
  accessToken: string,
): Promise<{ sub: string; email: string }> {
  const resp = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    throw new Error(`Userinfo fetch failed: ${resp.status}`);
  }
  return (await resp.json()) as { sub: string; email: string };
}

export type CalendarAccountLike = {
  id: number;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiry: Date | null;
};

/** Returns a valid access token, refreshing if within 5 minutes of expiry. */
export async function getValidToken(row: CalendarAccountLike): Promise<string> {
  const fiveMinutes = 5 * 60 * 1000;
  const isExpiringSoon = row.tokenExpiry
    ? row.tokenExpiry.getTime() - Date.now() < fiveMinutes
    : true;

  if (!isExpiringSoon) return row.accessToken;
  if (!row.refreshToken) throw new Error("No refresh token — re-auth required");

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: row.refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) throw new Error(`Refresh failed: ${resp.status}`);
  const data = (await resp.json()) as { access_token: string; expires_in: number };

  const newExpiry = new Date(Date.now() + data.expires_in * 1000);
  await pool.query(
    "UPDATE calendar_accounts SET access_token = $1, token_expiry = $2 WHERE id = $3",
    [data.access_token, newExpiry.toISOString(), row.id],
  );

  return data.access_token;
}
