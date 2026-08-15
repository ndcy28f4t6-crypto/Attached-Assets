import "express-session";

declare module "express-session" {
  interface SessionData {
    /** CSRF state token stored during Google OAuth initiation. */
    googleOAuthState?: string;
  }
}
