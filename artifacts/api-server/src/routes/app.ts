import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appStateTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { SaveAppStateBody } from "@workspace/api-zod";

const router: IRouter = Router();

// Seed state for first-time users
const seedState = {
  tasks: [
    { id: 't1', title: 'Send the revised proposal to Maya', project: 'Work rhythm', due: 'Today', time: '09:30', priority: 'high', done: false },
    { id: 't2', title: 'Book a quiet place for Friday', project: 'Personal', due: 'Today', time: '11:00', priority: 'medium', done: false },
    { id: 't3', title: 'Review the first three portfolio notes', project: 'Portfolio refresh', due: 'Today', time: '14:00', priority: 'medium', done: false },
    { id: 't4', title: 'Walk around the block before dinner', project: 'Personal', due: 'Today', time: '18:30', priority: 'low', done: false },
    { id: 't5', title: "Outline next week\u2019s priorities", project: 'Work rhythm', due: 'Tomorrow', priority: 'low', done: false },
    { id: 't6', title: 'Choose two photos for the case study', project: 'Portfolio refresh', due: 'Friday', priority: 'medium', done: true },
  ],
  projects: [
    { id: 'p1', name: 'Work rhythm', description: 'A clearer week with fewer loose ends.', color: '#e88870', goal: 'Protect two deep-work mornings' },
    { id: 'p2', name: 'Portfolio refresh', description: 'A small, honest collection of recent work.', color: '#a9cbbd', goal: 'Publish the first draft' },
    { id: 'p3', name: 'Home, gently', description: 'Make the home feel easy to return to.', color: '#d9ba83', goal: 'Finish the Sunday reset' },
    { id: 'p4', name: 'Personal', description: 'The little things that keep the week kind.', color: '#b7afb9', goal: 'Leave room for real life' },
  ],
  captures: [
    { id: 'c1', text: 'Remember to ask Jo about the intro when I send the proposal.', createdAt: 'Today, 08:42', converted: false },
    { id: 'c2', text: 'I want to make more space for reading without making it another project.', createdAt: 'Yesterday, 20:16', converted: true },
  ],
  preferences: {
    dark: false,
    accent: '#e88870',
    memory: true,
    reminders: true,
    sectionOrder: ['briefing', 'whatnow', 'priorities', 'timeline', 'capture', 'quote'],
    fontStyle: 'modern',
    calendarConnected: 'none',
  },
  waitingFor: [],
  people: [],
};

// GET /app/state — returns state scoped to the caller's anonymous session
router.get("/app/state", async (req, res): Promise<void> => {
  const sessionId = req.sessionID;
  try {
    const rows = await db
      .select()
      .from(appStateTable)
      .where(eq(appStateTable.sessionId, sessionId));

    if (rows.length > 0) {
      res.json(rows[0].state);
      return;
    }

    // First visit for this session: insert seed state and return it
    await db.insert(appStateTable).values({ sessionId, state: seedState });
    res.json(seedState);
  } catch (err) {
    req.log.error({ err }, "getAppState error");
    res.status(500).json({ error: "Failed to load app state" });
  }
});

// PUT /app/state — replaces state scoped to the caller's anonymous session
router.put("/app/state", async (req, res): Promise<void> => {
  const sessionId = req.sessionID;

  // Validate request body against the generated Zod schema
  const parsed = SaveAppStateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid state body", details: parsed.error.flatten() });
    return;
  }

  const state = parsed.data;

  try {
    // Upsert scoped to this session's row only
    await db
      .insert(appStateTable)
      .values({ sessionId, state })
      .onConflictDoUpdate({
        target: appStateTable.sessionId,
        set: { state, updatedAt: new Date() },
      });

    res.json(state);
  } catch (err) {
    req.log.error({ err }, "saveAppState error");
    res.status(500).json({ error: "Failed to save app state" });
  }
});

export default router;
