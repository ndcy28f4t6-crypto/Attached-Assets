import { Router, type IRouter } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";

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

/** Fetch the user's Google calendar list. Retries once on failure before returning []. */
async function fetchGoogleCalendarList(connectors: ReturnType<typeof getConnectors>): Promise<GoogleCalendarItem[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await connectors.proxy(
        "google-calendar",
        "/calendar/v3/users/me/calendarList?maxResults=250",
        { method: "GET" }
      );
      if (resp.ok) {
        const data = await resp.json() as { items?: GoogleCalendarItem[] };
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

router.get("/calendar/status", async (_req, res): Promise<void> => {
  try {
    const connectors = getConnectors();
    const [googleItems, outlookConnected] = await Promise.all([
      fetchGoogleCalendarList(connectors),
      checkOutlookConnected(connectors),
    ]);
    const googleConnected = googleItems.length > 0;
    res.json({
      connected: googleConnected || outlookConnected,
      provider: googleConnected ? "google" : outlookConnected ? "outlook" : "none",
      outlookConnected,
    });
  } catch {
    res.json({ connected: false, provider: "none", outlookConnected: false });
  }
});

router.get("/calendar/week-summary", async (req, res): Promise<void> => {
  try {
    const connectors = getConnectors();
    const weekStartParam = typeof req.query["weekStart"] === "string" ? req.query["weekStart"] : null;
    if (!weekStartParam) {
      res.status(400).json({ error: "weekStart query parameter is required" });
      return;
    }

    // Build the 7-day window
    const weekStart = new Date(`${weekStartParam}T00:00:00`);
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      days.push(`${y}-${m}-${dd}`);
    }

    const [googleItems, outlookEntries] = await Promise.all([
      fetchGoogleCalendarList(connectors),
      fetchOutlookCalendarList(connectors),
    ]);

    if (googleItems.length === 0 && outlookEntries.length === 0) {
      // No calendar connected — return all zeros so UI degrades gracefully
      const summary: Record<string, number> = {};
      for (const day of days) summary[day] = 0;
      res.json(summary);
      return;
    }

    const selectedGoogleCals = googleItems.filter((cal) => cal.selected !== false);

    // Fetch all 7 days in parallel across both providers
    const dayCounts = await Promise.all(
      days.map(async (dateStr): Promise<number> => {
        const dayStart = new Date(`${dateStr}T00:00:00`);
        const dayEnd = new Date(`${dateStr}T23:59:59`);
        const timeMin = encodeURIComponent(toISOWithOffset(dayStart));
        const timeMax = encodeURIComponent(toISOWithOffset(dayEnd));

        // Google calendars
        const googleCounts = await Promise.all(
          selectedGoogleCals.map(async (cal): Promise<number> => {
            try {
              const encodedId = encodeURIComponent(cal.id);
              const eventsResp = await connectors.proxy(
                "google-calendar",
                `/calendar/v3/calendars/${encodedId}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&maxResults=50`,
                { method: "GET" }
              );
              if (!eventsResp.ok) return 0;
              const data = await eventsResp.json() as { items?: unknown[] };
              return (data.items ?? []).length;
            } catch {
              return 0;
            }
          })
        );

        // Outlook calendars
        const outlookCounts = await Promise.all(
          outlookEntries.map(async (cal): Promise<number> => {
            const rawId = cal.id.slice("outlook::".length);
            try {
              const eventsResp = await connectors.proxy(
                "outlook",
                `/v1.0/me/calendars/${encodeURIComponent(rawId)}/events?$filter=start/dateTime ge '${dayStart.toISOString()}' and end/dateTime le '${dayEnd.toISOString()}'&$top=50&$select=id`,
                { method: "GET" }
              );
              if (!eventsResp.ok) return 0;
              const data = await eventsResp.json() as { value?: unknown[] };
              return (data.value ?? []).length;
            } catch {
              return 0;
            }
          })
        );

        return [...googleCounts, ...outlookCounts].reduce((sum, n) => sum + n, 0);
      })
    );

    const summary: Record<string, number> = {};
    for (let i = 0; i < days.length; i++) {
      summary[days[i]] = dayCounts[i];
    }
    res.json(summary);
  } catch (err) {
    req.log.error({ err }, "Calendar week-summary error");
    res.status(503).json({ error: "Calendar not connected or unavailable" });
  }
});

router.get("/calendar/calendars", async (req, res): Promise<void> => {
  try {
    const connectors = getConnectors();
    const [googleItems, outlookEntries] = await Promise.all([
      fetchGoogleCalendarList(connectors),
      fetchOutlookCalendarList(connectors),
    ]);

    const calendars: CalendarEntry[] = [
      ...googleItems.map((cal): CalendarEntry => ({
        id: cal.id,
        name: cal.summary ?? cal.id,
        color: cal.backgroundColor ?? "#4285f4",
        accessRole: cal.accessRole ?? "reader",
        selected: cal.selected !== false,
        provider: "google",
      })),
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

    // Determine the target date (defaults to today)
    const dateParam = typeof req.query["date"] === "string" ? req.query["date"] : null;
    const targetDate = dateParam ? new Date(dateParam) : new Date();

    // Build day-start and day-end in local time
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    const timeMin = encodeURIComponent(toISOWithOffset(dayStart));
    const timeMax = encodeURIComponent(toISOWithOffset(dayEnd));

    const googleItems = await fetchGoogleCalendarList(connectors);
    if (googleItems.length === 0) {
      res.status(503).json({ error: "Calendar not connected or unavailable" });
      return;
    }

    // Only query Google calendars that the user has selected
    const selectedGoogleCals = googleItems.filter((cal) => cal.selected !== false);

    // Fan out event queries across all Google calendars in parallel
    const googleEventResults = await Promise.all(
      selectedGoogleCals.map(async (cal): Promise<CalendarEventEntry[]> => {
        try {
          const encodedId = encodeURIComponent(cal.id);
          const eventsResp = await connectors.proxy(
            "google-calendar",
            `/calendar/v3/calendars/${encodedId}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=50`,
            { method: "GET" }
          );

          if (!eventsResp.ok) {
            req.log.warn({ calendarId: cal.id, status: eventsResp.status }, "Events fetch failed for calendar");
            return [];
          }

          const data = await eventsResp.json() as {
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
              id: `${cal.id}::${item.id}`,
              title: item.summary ?? "(No title)",
              start: startRaw,
              end: endRaw,
              allDay,
              location: item.location ?? null,
              description: item.description ?? null,
              calendarId: cal.id,
              calendarName: cal.summary ?? null,
              color: item.colorId ?? null,
              calendarColor: cal.backgroundColor ?? null,
            };
          });
        } catch (err) {
          req.log.warn({ calendarId: cal.id, err }, "Error fetching events for calendar");
          return [];
        }
      })
    );

    // Fetch Outlook events per-calendar so calendarId matches the calendar list keys
    const outlookEntries = await fetchOutlookCalendarList(connectors);
    const outlookEventResults = await Promise.all(
      outlookEntries.map(async (cal): Promise<CalendarEventEntry[]> => {
        // cal.id is "outlook::<rawOutlookId>"; extract the raw ID for the API call
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
            calendarId: cal.id,  // "outlook::<rawId>" — matches the calendar list
            calendarName: cal.name,
            color: null,
            calendarColor: cal.color,
          }));
        } catch {
          return [];
        }
      })
    );

    // Flatten all results and sort by start time
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
