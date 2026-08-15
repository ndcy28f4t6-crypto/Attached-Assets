import { integer, jsonb, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

// Stores the entire My Day AI app state as a single JSON blob per anonymous session.
// Each browser gets a stable session ID (from express-session) that acts as the owner key.
export const appStateTable = pgTable("app_state", {
  sessionId: text("session_id").primaryKey(),
  state: jsonb("state").notNull(),
  // Monotonically-increasing counter used for optimistic-concurrency control.
  // A PUT with a stale revision returns 409 so the client can merge and retry.
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AppStateRow = typeof appStateTable.$inferSelect;
export type InsertAppStateRow = typeof appStateTable.$inferInsert;

// Stores OAuth tokens for each Google account the user has connected.
// Multiple rows per session are allowed (one per Google identity).
export const calendarAccountsTable = pgTable(
  "calendar_accounts",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    googleSub: text("google_sub").notNull(),
    email: text("email").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    tokenExpiry: timestamp("token_expiry", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [unique("uniq_session_google_sub").on(table.sessionId, table.googleSub)],
);

export type CalendarAccountRow = typeof calendarAccountsTable.$inferSelect;
export type InsertCalendarAccountRow = typeof calendarAccountsTable.$inferInsert;
