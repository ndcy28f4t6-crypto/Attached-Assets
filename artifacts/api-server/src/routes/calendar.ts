import { Router, type IRouter } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { pool } from "@workspace/db";
import { getValidToken } from "../lib/googleAuth.js";

const router: IRouter = Router();

function getConnectors() {
  return new ReplitConnectors();
}

function toISOWithOffset(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const h = Math.floor(Math.abs(offset) / 60);
  const m = Math.abs(offset) % 60;
  return (
    date.toISOString().slice(0, 19) + sign + pad(h) + ":" + pad(m)
  );
}

type GoogleCalendarItem = {
  id: string;
  summary?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  selected?: boolean;
  accessRole?: string;
};

/** Shared calendar entry shape returned by /calendar/calendars */
type CalendarEntry = {
  id: string;
  name: string;
  color: string;
  accessRole: string;
  selected: boolean;
  provider: "google" | "outlook";
};

/** Shared event shape returned by /calendar/events */
type CalendarEventEntry = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  calendarId: string;
  calendarName: string | null;
  color: string | null;
  calendarColor: string | null;
};

type StoredAccount = {
  id: number;
  email: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiry: Date | null;
};

/** Query all Google accounts stored for a given session. */
async function getSessionAccounts(sessionId: string): Promise<StoredAccount[]> {
  const result = await pool.query<{
    id: number;
    email: string;
    access_token: string;
    refresh_token: string | null;
    token_expiry: Date | null;
  }>(
    "SELECT id, email, access_token, refresh_token, token_expiry FROM calendar_accounts WHERE session_id = $1",
    [sessionId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    email: row.email,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiry: row.token_expiry,
  }));
}

/** Fetch calendar list for a single Google account. Returns [] on error. */
async function fetchGoogleCalendarListForAccount(
  account: StoredAccount,
): Promise<GoogleCalendarItem[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const token = await getValidToken(account);
      const resp = await fetch(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250",
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (resp.ok) {
        const data = (await resp.json()) as { items?: GoogleCalendarItem[] };
        return data.items ?? [];
      }
    } catch {
      // fall through to retry
    }
    if (attempt < 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 400));
    }
  }
  return [];
}

/** Check if Outlook connector is available and authorized. */
async function checkOutlookConnected(connectors: ReturnType<typeof getConnectors>): Promise<boolean> {
  try {
    const resp = await connectors.proxy(
      "outlook",
      "/v1.0/me/calendars?$top=1",
      { method: "GET" }
    );
    return resp.ok;
  } catch {
    return false;
  }
}

/** Fetch Outlook calendar entries (returns [] when not connected or on error). */
async function fetchOutlookCalendarList(connectors: ReturnType<typeof getConnectors>): Promise<CalendarEntry[]> {
  try {
    const resp = await connectors.proxy(
      "outlook",
      "/v1.0/me/calendars?$top=50",
      { method: "GET" }
    );
    if (!resp.ok) return [];
    const data = await resp.json() as {
      value?: Array<{
        id: string;
        name?: string;
        canEdit?: boolean;
      }>;
    };
    return (data.value ?? []).map((cal) => ({
      id: `outlook::${cal.id}`,
      name: cal.name ?? "Outlook Calendar",
      color: "#0078d4",
      accessRole: cal.canEdit ? "writer" : "reader",
      selected: true,
      provider: "outlook" as const,
    }));
  } catch {
    return [];
  }
}

router.get("/calendar/status", async (req, res): Promise<void> => {
  try {
    const connectors = getConnectors();
    const [accounts, outlookConnected] = await Promise.all([
      getSessionAccounts(req.sessionID),
      checkOutlookConnected(connectors),
    ]);
    const googleAccounts = accounts.map((a) => ({ id: a.id, email: a.email }));
    res.json({
      connected: googleAccounts.length > 0 || outlookConnected,
      provider: googleAccounts.length > 0 ? "google" : outlookConnected ? "outlook" : "none",
      outlookConnected,
      googleAccounts,
    });
  } catch {
    res.json({ connected: false, provider: "none", outlookConnected: false, googleAccounts: [] });
  }
});

router.get("/calendar/calendars", async (req, res): Promise<void> => {
  try {
    const connectors = getConnectors();
    const accounts = await getSessionAccounts(req.sessionID);

    // Fetch calendar lists from all Google accounts in parallel
    const googleResults = await Promise.all(
      accounts.map(async (account): Promise<CalendarEntry[]> => {
        const items = await fetchGoogleCalendarListForAccount(account);
        return items.map((cal): CalendarEntry => ({
          id: `${account.email}::${cal.id}`,
          name: cal.summary ?? cal.id,
          color: cal.backgroundColor ?? "#4285f4",
          accessRole: cal.accessRole ?? "reader",
          selected: cal.selected !== false,
          provider: "google",
        }));
      }),
    );

    const outlookEntries = await fetchOutlookCalendarList(connectors);
    const calendars: CalendarEntry[] = [
      ...googleResults.flat(),
      ...outlookEntries,
    ];

    res.json(calendars);
  } catch (err) {
    req.log.error({ err }, "Calendar list error");
    res.status(503).json({ error: "Calendar not connected or unavailable" });
  }
});

router.get("/calendar/events", async (req, res): Promise<void> => {
  try {
    const connectors = getConnectors();

    const dateParam = typeof req.query["date"] === "string" ? req.query["date"] : null;
    const targetDate = dateParam ? new Date(dateParam) : new Date();

    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    const timeMin = encodeURIComponent(toISOWithOffset(dayStart));
    const timeMax = encodeURIComponent(toISOWithOffset(dayEnd));

    const accounts = await getSessionAccounts(req.sessionID);

    // Fan out across all Google accounts
    const googleEventResults = await Promise.all(
      accounts.map(async (account): Promise<CalendarEventEntry[]> => {
        try {
          const token = await getValidToken(account);
          const items = await fetchGoogleCalendarListForAccount(account);
          const selectedCals = items.filter((cal) => cal.selected !== false);

          const calEventResults = await Promise.all(
            selectedCals.map(async (cal): Promise<CalendarEventEntry[]> => {
              try {
                const encodedId = encodeURIComponent(cal.id);
                const eventsResp = await fetch(
                  `https://www.googleapis.com/calendar/v3/calendars/${encodedId}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=50`,
                  { headers: { Authorization: `Bearer ${token}` } },
                );
                if (!eventsResp.ok) {
                  req.log.warn(
                    { calendarId: cal.id, status: eventsResp.status },
                    "Events fetch failed for calendar",
                  );
                  return [];
                }
                const data = (await eventsResp.json()) as {
                  items?: Array<{
                    id: string;
                    summary?: string;
                    start?: { dateTime?: string; date?: string };
                    end?: { dateTime?: string; date?: string };
                    location?: string;
                    description?: string;
                    colorId?: string;
                  }>;
                };
                return (data.items ?? []).map((item): CalendarEventEntry => {
                  const startRaw = item.start?.dateTime ?? item.start?.date ?? "";
                  const endRaw = item.end?.dateTime ?? item.end?.date ?? "";
                  const allDay = !item.start?.dateTime;
                  return {
                    id: `${account.email}::${cal.id}::${item.id}`,
                    title: item.summary ?? "(No title)",
                    start: startRaw,
                    end: endRaw,
                    allDay,
                    location: item.location ?? null,
                    description: item.description ?? null,
                    calendarId: `${account.email}::${cal.id}`,
                    calendarName: cal.summary ?? null,
                    color: item.colorId ?? null,
                    calendarColor: cal.backgroundColor ?? null,
                  };
                });
              } catch (err) {
                req.log.warn({ calendarId: cal.id, err }, "Error fetching events for calendar");
                return [];
              }
            }),
          );
          return calEventResults.flat();
        } catch (err) {
          req.log.warn({ accountEmail: account.email, err }, "Error fetching Google events for account");
          return [];
        }
      }),
    );

    // Fetch Outlook events per-calendar so calendarId matches the calendar list keys
    const outlookEntries = await fetchOutlookCalendarList(connectors);
    const outlookEventResults = await Promise.all(
      outlookEntries.map(async (cal): Promise<CalendarEventEntry[]> => {
        const rawId = cal.id.slice("outlook::".length);
        try {
          const eventsResp = await connectors.proxy(
            "outlook",
            `/v1.0/me/calendars/${encodeURIComponent(rawId)}/events?$filter=start/dateTime ge '${dayStart.toISOString()}' and end/dateTime le '${dayEnd.toISOString()}'&$top=50&$select=subject,start,end,location,bodyPreview,isAllDay`,
            { method: "GET" }
          );
          if (!eventsResp.ok) return [];
          const data = await eventsResp.json() as {
            value?: Array<{
              id: string;
              subject?: string;
              start?: { dateTime: string };
              end?: { dateTime: string };
              location?: { displayName?: string };
              bodyPreview?: string;
              isAllDay?: boolean;
            }>;
          };
          return (data.value ?? []).map((item): CalendarEventEntry => ({
            id: `${cal.id}::${item.id}`,
            title: item.subject ?? "(No title)",
            start: item.start?.dateTime ?? "",
            end: item.end?.dateTime ?? "",
            allDay: item.isAllDay ?? false,
            location: item.location?.displayName ?? null,
            description: item.bodyPreview ?? null,
            calendarId: cal.id,
            calendarName: cal.name,
            color: null,
            calendarColor: cal.color,
          }));
        } catch {
          return [];
        }
      })
    );

    const events: CalendarEventEntry[] = [
      ...googleEventResults.flat(),
      ...outlookEventResults.flat(),
    ].sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return a.start.localeCompare(b.start);
    });

    res.json(events);
  } catch (err) {
    req.log.error({ err }, "Calendar events error");
    res.status(503).json({ error: "Calendar not connected or unavailable" });
  }
});

export default router;
