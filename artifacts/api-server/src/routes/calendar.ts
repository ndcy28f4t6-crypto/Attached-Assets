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

    const eventsResp = await connectors.proxy(
      "google-calendar",
      `/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=50`,
      { method: "GET" }
    );

    if (!eventsResp.ok) {
      req.log.warn({ status: eventsResp.status }, "Google Calendar events fetch failed");
      res.status(503).json({ error: "Calendar not connected or unavailable" });
      return;
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

    const events = (data.items ?? []).map((item) => {
      const startRaw = item.start?.dateTime ?? item.start?.date ?? "";
      const endRaw = item.end?.dateTime ?? item.end?.date ?? "";
      const allDay = !item.start?.dateTime;
      return {
        id: item.id,
        title: item.summary ?? "(No title)",
        start: startRaw,
        end: endRaw,
        allDay,
        location: item.location ?? null,
        description: item.description ?? null,
        calendarId: "primary",
        color: item.colorId ?? null,
      };
    });

    res.json(events);
  } catch (err) {
    req.log.error({ err }, "Calendar events error");
    res.status(503).json({ error: "Calendar not connected or unavailable" });
  }
});

export default router;
