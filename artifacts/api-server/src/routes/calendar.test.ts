/**
 * Tests for the /calendar/events route's resilience to partial failures.
 *
 * The fan-out in calendar.ts intentionally swallows per-calendar errors so that
 * a single unavailable calendar does not suppress events from others. These tests
 * confirm that behaviour and verify the 503 path when the calendar list itself
 * is unreachable.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";

// ---------------------------------------------------------------------------
// vi.hoisted ensures the mock function exists before vi.mock's factory runs
// (vi.mock factories are hoisted above imports, so plain `const` refs break).
// ---------------------------------------------------------------------------
const mockProxy = vi.hoisted(() => vi.fn());

vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: vi.fn(function () {
    return { proxy: mockProxy };
  }),
}));

// Import the router after the mock is in place.
import calendarRouter from "./calendar.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Express app that mounts the calendar router. */
function buildApp(): Express {
  const app = express();

  // Attach a silent logger so req.log.warn / req.log.error calls don't throw.
  app.use(function (_req: Request, _res: Response, next: NextFunction) {
    (_req as Request & { log: Record<string, unknown> }).log = {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    };
    next();
  });

  app.use("/api", calendarRouter);
  return app;
}

/** A mock proxy response that signals success. */
function okResponse(data: unknown) {
  return { ok: true, status: 200, json: async function () { return data; } };
}

/** A mock proxy response that signals an HTTP error. */
function errorResponse(status = 500) {
  return { ok: false, status };
}

// A minimal calendar-list payload with two calendars.
const CALENDAR_LIST_PAYLOAD = {
  items: [
    {
      id: "cal_primary",
      summary: "Primary",
      backgroundColor: "#4285f4",
      selected: true,
      accessRole: "owner",
    },
    {
      id: "cal_work",
      summary: "Work",
      backgroundColor: "#0f9d58",
      selected: true,
      accessRole: "writer",
    },
  ],
};

// A minimal events payload for cal_primary.
const PRIMARY_EVENTS_PAYLOAD = {
  items: [
    {
      id: "evt1",
      summary: "Stand-up",
      start: { dateTime: "2026-08-15T09:00:00+00:00" },
      end: { dateTime: "2026-08-15T09:30:00+00:00" },
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/calendar/events – partial calendar failure", () => {
  let app: Express;

  beforeEach(() => {
    vi.resetAllMocks();
    app = buildApp();
  });

  it("still returns events from healthy calendars when one calendar's events fetch fails", async () => {
    // Calendar-list call succeeds → two calendars.
    // cal_primary events → 200 with one event.
    // cal_work events    → 500 (simulates a temporarily unavailable calendar).
    // Outlook probes     → 403 (not connected).
    mockProxy.mockImplementation(function (_service: string, url: string) {
      if (url.includes("calendarList")) {
        return Promise.resolve(okResponse(CALENDAR_LIST_PAYLOAD));
      }
      if (url.includes("cal_primary")) {
        return Promise.resolve(okResponse(PRIMARY_EVENTS_PAYLOAD));
      }
      if (url.includes("cal_work")) {
        return Promise.resolve(errorResponse(500));
      }
      // Outlook calls
      return Promise.resolve(errorResponse(403));
    });

    const res = await request(app).get("/api/calendar/events");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // Events from the healthy calendar must be present.
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: "cal_primary::evt1", title: "Stand-up" });
  });

  it("returns 503 when the calendarList endpoint is unavailable", async () => {
    // fetchGoogleCalendarList retries once after a 400 ms delay, so both
    // attempts fail before the route returns 503. We allow up to 3 s for the
    // real timer to fire — fake timers are intentionally avoided because they
    // intercept Node's HTTP internals and deadlock supertest.
    mockProxy.mockResolvedValue(errorResponse(503));

    const res = await request(app).get("/api/calendar/events");

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  }, 3000);
});
