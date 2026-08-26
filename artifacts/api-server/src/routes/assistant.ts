import { Router, type IRouter } from "express";
import { ParseAssistantTranscriptBody, ParseAssistantTranscriptResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { appStateTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

const scheduledEventSchema = {
  type: "object",
  properties: {
    task_title: { type: "string" },
    start_datetime: { type: "string", description: "ISO 8601 timestamp with timezone" },
    end_datetime: { type: "string", description: "ISO 8601 timestamp with timezone" },
    reminder_datetime: { type: "string", description: "ISO 8601 timestamp with timezone" },
  },
  required: ["task_title", "start_datetime", "end_datetime", "reminder_datetime"],
  additionalProperties: false,
};

function validDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

router.post("/assistant/parse", async (req, res): Promise<void> => {
  const request = ParseAssistantTranscriptBody.safeParse(req.body);
  if (!request.success) {
    res.status(400).json({ error: "A transcript is required." });
    return;
  }

  const browserNow = validDate(request.data.now) ?? new Date();
  const transcript = request.data.transcript.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 8192,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "scheduled_event",
          strict: true,
          schema: scheduledEventSchema,
        },
      },
      messages: [
        {
          role: "system",
          content: [
            "You turn a person's spoken thought into one calm, actionable scheduled event.",
            `The user's current local time is ${browserNow.toISOString()}. Resolve relative dates such as tomorrow, Friday, or this afternoon from that time.`,
            "Return only the requested JSON object. Never include markdown or extra keys.",
            "Make task_title an actionable but natural short name.",
            "Use ISO 8601 timestamps with timezone offsets or Z.",
            "If no duration is stated, make end_datetime exactly one hour after start_datetime.",
            "If no reminder is stated, set reminder_datetime to 15 minutes before start_datetime.",
            "If the user gives no date, choose the next reasonable occurrence during waking hours.",
          ].join(" "),
        },
        { role: "user", content: transcript },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("The AI returned an empty response.");

    const raw = JSON.parse(content) as Record<string, unknown>;
    const start = validDate(raw.start_datetime);
    const end = validDate(raw.end_datetime) ?? (start ? new Date(start.getTime() + 60 * 60 * 1000) : null);
    const reminder = validDate(raw.reminder_datetime) ?? (start ? new Date(start.getTime() - 15 * 60 * 1000) : null);
    const title = typeof raw.task_title === "string" ? raw.task_title.trim() : "";

    const normalized = ParseAssistantTranscriptResponse.safeParse({
      task_title: title,
      start_datetime: start?.toISOString(),
      end_datetime: end?.toISOString(),
      reminder_datetime: reminder?.toISOString(),
    });
    if (!normalized.success || !title || !start || !end || !reminder) {
      throw new Error("The AI returned an incomplete schedule.");
    }

    res.json({
      task_title: title,
      start_datetime: start.toISOString(),
      end_datetime: end.toISOString(),
      reminder_datetime: reminder.toISOString(),
    });
  } catch (error) {
    req.log.error({ error }, "assistant parse error");
    res.status(502).json({ error: "I couldn't turn that into a schedule. Please try saying it another way." });
  }
});

type StoredScheduledEvent = {
  id: string;
  task_title: string;
  start_datetime: string;
  end_datetime: string;
  reminder_datetime: string;
  created_at: string;
};

router.get("/assistant/reminders", async (req, res): Promise<void> => {
  const requestedSince = typeof req.query.since === "string" ? validDate(req.query.since) : null;
  const now = new Date();
  const since = requestedSince ?? new Date(now.getTime() - 65_000);

  try {
    const rows = await db
      .select({ state: appStateTable.state })
      .from(appStateTable)
      .where(eq(appStateTable.sessionId, req.sessionID));
    const stored = rows[0]?.state as { scheduledEvents?: unknown[] } | undefined;
    const events = Array.isArray(stored?.scheduledEvents) ? stored.scheduledEvents : [];
    const due = events.filter((value): value is StoredScheduledEvent => {
      if (!value || typeof value !== "object") return false;
      const event = value as Partial<StoredScheduledEvent>;
      const reminder = validDate(event.reminder_datetime);
      return Boolean(
        typeof event.id === "string" &&
          typeof event.task_title === "string" &&
          typeof event.start_datetime === "string" &&
          typeof event.end_datetime === "string" &&
          typeof event.created_at === "string" &&
          reminder &&
          reminder.getTime() >= since.getTime() &&
          reminder.getTime() <= now.getTime(),
      );
    });
    res.json(due);
  } catch (error) {
    req.log.error({ error }, "assistant reminders error");
    res.status(500).json({ error: "Unable to check reminders right now." });
  }
});

export default router;