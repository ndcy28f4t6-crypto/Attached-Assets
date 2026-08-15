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

router.get("/calendar/status", async (_req, res): Promise<void> => {
  try {
    const connectors = getConnectors();
    const probe = await connectors.proxy(
      "google-calendar",
      "/calendar/v3/users/me/calendarList?maxResults=1",
      { method: "GET" }
    );
    if (probe.ok) {
      res.json({ connected: true, provider: "google" });
    } else {
      res.json({ connected: false, provider: "none" });
    }
  } catch {
    res.json({ connected: false, provider: "none" });
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

    // Fetch the full calendar list so we can query all calendars in parallel
    const calListResp = await connectors.proxy(
      "google-calendar",
      "/calendar/v3/users/me/calendarList?maxResults=250",
      { method: "GET" }
    );

    if (!calListResp.ok) {
      req.log.warn({ status: calListResp.status }, "Google Calendar list fetch failed");
      res.status(503).json({ error: "Calendar not connected or unavailable" });
      return;
    }

    const calListData = await calListResp.json() as {
      items?: Array<{
        id: string;
        summary?: string;
        backgroundColor?: string;
        foregroundColor?: string;
        selected?: boolean;
        accessRole?: string;
      }>;
    };

    // Only query calendars that the user has selected (shown in their list)
    const calendars = (calListData.items ?? []).filter(
      (cal) => cal.selected !== false
    );

    // Fan out event queries across all calendars in parallel
    const perCalendarResults = await Promise.all(
      calendars.map(async (cal) => {
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

          return (data.items ?? []).map((item) => {
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

    // Flatten all results and sort by start time
    const events = perCalendarResults
      .flat()
      .sort((a, b) => {
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
