import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Stores the entire My Day AI app state as a single JSON blob per anonymous session.
// Each browser gets a stable session ID (from express-session) that acts as the owner key.
export const appStateTable = pgTable("app_state", {
  sessionId: text("session_id").primaryKey(),
  state: jsonb("state").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AppStateRow = typeof appStateTable.$inferSelect;
export type InsertAppStateRow = typeof appStateTable.$inferInsert;
