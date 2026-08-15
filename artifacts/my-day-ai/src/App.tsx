import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Archive, ArrowLeft, ArrowRight, Bell, Brain, Calendar, CalendarClock, CalendarDays, Cake, Check,
  CheckCircle2, ChevronDown, ChevronUp, CircleHelp, ClipboardList, Clock3, Command, Compass,
  Download, FolderKanban, Gauge, Headphones, HeartHandshake, Home as HomeIcon, Keyboard, Lightbulb,
  ListChecks, Mail, Menu, MessageCircle, Mic, MoreHorizontal, Moon, Phone, Plus, RotateCcw,
  Search, Settings2, ShieldCheck, Sparkles, Sun, Trash2, UserRound, UsersRound, Volume2,
  WandSparkles, X
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  useGetCalendarEvents,
  useGetCalendarList,
  useGetCalendarStatus,
  useGetCalendarWeekSummary,
  useGetAppState,
  useSaveAppState,
  useGetAuthAccounts,
  useDeleteAuthAccountsId,
} from '@workspace/api-client-react';
import type { AppState as ServerAppState } from '@workspace/api-client-react';

const queryClient = new QueryClient();

// Legacy localStorage key – read once for migration, never written again
const LEGACY_STORAGE_KEY = 'my-day-ai-state-v1';
// Flag so we only attempt the migration once per browser
const MIGRATION_FLAG_KEY = 'my-day-ai-migrated-v1';
// sessionStorage key for changes queued during a server outage
const QUEUED_SAVE_KEY = 'my-day-ai-queued-save';

const QUOTES = [
  "Progress, not perfection.",
  "One small step is still movement.",
  "You don't have to solve everything today.",
  "Rest is part of the work.",
  "You've handled hard things before. This is one more.",
  "Clarity comes from action, not from thinking.",
  "Done is better than perfect.",
  "Your best is enough.",
  "Start anywhere.",
  "The next step is always smaller than it looks.",
  "What you tend to grows.",
  "Momentum starts with a single choice.",
  "You are more organized than you feel.",
  "Being overwhelmed is not a character flaw.",
  "Give yourself the grace you'd give a friend.",
  "Small wins still count.",
  "Today doesn't have to be perfect to be good.",
  "You are capable. Keep going.",
  "What matters most gets your best energy first.",
  "It is okay to begin again."
];

type Task = {
  id: string;
  title: string;
  project: string;
  due: string;
  time?: string;
  estTime?: string;
  priority: 'high' | 'medium' | 'low';
  done: boolean;
};
type Project = { id: string; name: string; description: string; color: string; goal: string };
type Capture = { id: string; text: string; createdAt: string; converted: boolean };
type ImportantDate = { id: string; label: string; date: string };
type ConnectionLog = { id: string; date: string; note?: string; method?: string };
type Person = {
  id: string;
  name: string;
  relationship: string;
  contactMethod: string;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'custom' | 'none';
  customDays?: number;
  birthday?: string;
  importantDates: ImportantDate[];
  notes: string;
  lastConnectedAt?: string;
  reminderSnoozedUntil?: string;
  connections: ConnectionLog[];
};
type Preferences = { dark: boolean; accent: string; memory: boolean; reminders: boolean; sectionOrder: string[]; fontStyle: 'modern' | 'classic' | 'rounded'; calendarConnected: 'none' | 'google' | 'outlook'; calendarPrefs?: Record<string, { visible: boolean; color: string | null }>; dismissedDuplicates?: string[] };
type WaitingFor = { id: string; person: string; item: string; addedAt: string };
type AppState = { tasks: Task[]; projects: Project[]; captures: Capture[]; preferences: Preferences; waitingFor: WaitingFor[]; people: Person[] };

const defaultPreferences: Preferences = {
  dark: false, accent: '#e88870', memory: true, reminders: true,
  sectionOrder: ['briefing', 'whatnow', 'priorities', 'timeline', 'capture', 'quote'],
  fontStyle: 'modern', calendarConnected: 'none', calendarPrefs: {}, dismissedDuplicates: [],
};

/** Read & backfill legacy localStorage state for one-time migration. */
function readLegacyLocalStorage(): AppState | null {
  try {
    const saved = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as AppState;
    if (!parsed.preferences) parsed.preferences = defaultPreferences;
    if (!parsed.preferences.sectionOrder) parsed.preferences.sectionOrder = defaultPreferences.sectionOrder;
    if (!parsed.preferences.fontStyle) parsed.preferences.fontStyle = defaultPreferences.fontStyle;
    if (!parsed.preferences.calendarConnected) parsed.preferences.calendarConnected = defaultPreferences.calendarConnected;
    if (!parsed.preferences.calendarPrefs) parsed.preferences.calendarPrefs = {};
    if (!parsed.preferences.dismissedDuplicates) parsed.preferences.dismissedDuplicates = [];
    if (!parsed.waitingFor) parsed.waitingFor = [];
    if (!parsed.people) parsed.people = [];
    return parsed;
  } catch {
    return null;
  }
}

/** Coerce the server AppState type into our local AppState type (they match structurally). */
function toLocalState(s: ServerAppState): AppState {
  const raw = s as unknown as Partial<AppState>;
  return {
    tasks: raw.tasks ?? [],
    projects: raw.projects ?? [],
    captures: raw.captures ?? [],
    waitingFor: raw.waitingFor ?? [],
    people: raw.people ?? [],
    preferences: {
      ...defaultPreferences,
      ...(raw.preferences ?? {}),
      calendarPrefs: raw.preferences?.calendarPrefs ?? {},
      dismissedDuplicates: raw.preferences?.dismissedDuplicates ?? [],
    },
  };
}

/** Extract the `_revision` field the server embeds in every AppState response. */
function extractRevision(raw: unknown): number | null {
  if (typeof raw === 'object' && raw !== null && '_revision' in raw) {
    const r = (raw as Record<string, unknown>)._revision;
    return typeof r === 'number' ? r : null;
  }
  return null;
}

/** True when an error is a 409 Conflict (another tab saved first). */
function isConflictError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: number }).status === 409;
}

/**
 * Merge two task lists from a concurrent-edit conflict.
 * - Tasks present only on server are kept (added by another tab).
 * - Tasks present only in local are kept (added by this tab).
 * - Tasks in both get the local `done` value (most-recent user action wins).
 * Order: server tasks first, then local-only additions.
 */
function mergeTasks(serverTasks: Task[], localTasks: Task[]): Task[] {
  const serverById = new Map(serverTasks.map((t) => [t.id, t]));
  const localById = new Map(localTasks.map((t) => [t.id, t]));
  const merged: Task[] = serverTasks.map((t) => {
    const l = localById.get(t.id);
    return l ? { ...t, done: l.done } : t;
  });
  for (const t of localTasks) {
    if (!serverById.has(t.id)) merged.push(t); // local-only task
  }
  return merged;
}

function useAppState() {
  const { data: serverState, isLoading: isServerLoading } = useGetAppState();
  const { mutateAsync: saveToServerAsync } = useSaveAppState();

  const [state, setState] = useState<AppState | null>(null);
  const [notice, setNotice] = useState('');
  const initializedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedToastShownRef = useRef(false);
  // Last revision received from the server — sent with every PUT for conflict detection.
  const serverRevisionRef = useRef<number | null>(null);
  // true while the debounce save timer is active (used to guard window-focus refetches).
  const pendingSaveRef = useRef(false);
  // true when setState is called with server-sourced data so the save effect skips it.
  const suppressNextSaveRef = useRef(false);

  // Try to flush any changes that were queued during an outage
  const flushQueued = useCallback(async () => {
    const raw = sessionStorage.getItem(QUEUED_SAVE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as ServerAppState;
      await saveToServerAsync({ data });
      sessionStorage.removeItem(QUEUED_SAVE_KEY);
      queuedToastShownRef.current = false;
      toast({ title: 'Changes synced', description: 'Your queued changes have been saved to the server.' });
    } catch {
      // Still offline — will retry on next interval tick or next save attempt
    }
  }, [saveToServerAsync]);

  // Initialize local state from the server, and re-apply on every subsequent refetch.
  // React Query refetches on window focus by default so re-focusing a tab always pulls
  // the latest server revision, giving the tab an up-to-date base before any new edits.
  useEffect(() => {
    if (isServerLoading || serverState === undefined) return;

    // The server embeds _revision in the JSON response even though the TS type doesn't
    // declare it.  Extract it before coercing the payload into our local AppState type.
    const rev = extractRevision(serverState);

    if (!initializedRef.current) {
      // ── First load ──────────────────────────────────────────────────────────
      const alreadyMigrated = localStorage.getItem(MIGRATION_FLAG_KEY);
      if (!alreadyMigrated) {
        // First visit: migrate any existing localStorage data
        const legacyState = readLegacyLocalStorage();
        localStorage.setItem(MIGRATION_FLAG_KEY, '1');
        if (legacyState) {
          // User had local data — persist it to server, use it as state
          setState(legacyState);
          saveToServerAsync({ data: legacyState as unknown as ServerAppState }).catch(() => {
            sessionStorage.setItem(QUEUED_SAVE_KEY, JSON.stringify(legacyState));
          });
          initializedRef.current = true;
          return;
        }
      }
      // Normal first-load path: use what the server returned, then flush queued saves
      serverRevisionRef.current = rev;
      setState(toLocalState(serverState));
      initializedRef.current = true;
      void flushQueued();
      return;
    }

    // ── Subsequent refetch (e.g. refetchOnWindowFocus) ───────────────────────
    // Skip if the user has unsaved local edits — we'd overwrite their in-progress work.
    // Once their debounce save completes, the revision is current again.
    if (!pendingSaveRef.current) {
      serverRevisionRef.current = rev;
      suppressNextSaveRef.current = true;
      setState(toLocalState(serverState));
    }
  }, [serverState, isServerLoading, saveToServerAsync, flushQueued]);

  // Retry queued saves every 30 seconds while the tab is open
  useEffect(() => {
    const id = setInterval(flushQueued, 30_000);
    return () => clearInterval(id);
  }, [flushQueued]);

  // Debounced server save on every state change — with optimistic-concurrency and retry
  useEffect(() => {
    if (!state || !initializedRef.current) return;

    // State came from the server (refetch or 409 merge) — don't echo it back.
    if (suppressNextSaveRef.current) {
      suppressNextSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    pendingSaveRef.current = true;
    saveTimerRef.current = setTimeout(async () => {
      pendingSaveRef.current = false;

      // Include the last known revision so the server can detect concurrent writes.
      const data = { ...state, _clientRevision: serverRevisionRef.current } as unknown as ServerAppState;
      let saved = false;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await saveToServerAsync({ data });
          saved = true;
          // Track the new revision so the next save is conditional against it.
          const newRev = extractRevision(response);
          if (newRev !== null) serverRevisionRef.current = newRev;
          // Clear any queued save — we just successfully wrote the latest state
          if (sessionStorage.getItem(QUEUED_SAVE_KEY)) {
            sessionStorage.removeItem(QUEUED_SAVE_KEY);
            queuedToastShownRef.current = false;
            toast({ title: 'Changes synced', description: 'Your queued changes have been saved.' });
          }
          break;
        } catch (err: unknown) {
          // ── 409 Conflict ─────────────────────────────────────────────────────
          // Another tab saved before us.  Merge the two states and retry once.
          if (isConflictError(err)) {
            const conflictErr = err as { data: unknown };
            const serverData = conflictErr.data;
            const serverRev = extractRevision(serverData);
            const serverAppState = toLocalState(serverData as ServerAppState);
            const mergedTasks = mergeTasks(serverAppState.tasks, state.tasks);
            const mergedState: AppState = {
              ...serverAppState,
              tasks: mergedTasks,
              preferences: state.preferences, // keep this tab's preference changes
            };
            if (serverRev !== null) serverRevisionRef.current = serverRev;
            try {
              const mergePayload = { ...mergedState, _clientRevision: serverRev } as unknown as ServerAppState;
              const mergeResponse = await saveToServerAsync({ data: mergePayload });
              const mergeRev = extractRevision(mergeResponse);
              if (mergeRev !== null) serverRevisionRef.current = mergeRev;
              // Update local state to the merged result without triggering another save
              suppressNextSaveRef.current = true;
              setState(mergedState);
              saved = true;
            } catch {
              // Merge retry failed — fall through to queue the pending state
            }
            break; // Don't continue the retry loop after a 409
          }
          // ── Network error — exponential backoff ──────────────────────────────
          if (attempt < 3) {
            await new Promise<void>((resolve) => setTimeout(resolve, 300 * Math.pow(2, attempt - 1)));
          }
        }
      }
      if (!saved) {
        sessionStorage.setItem(QUEUED_SAVE_KEY, JSON.stringify(data));
        if (!queuedToastShownRef.current) {
          queuedToastShownRef.current = true;
          toast({
            title: 'Changes saved locally',
            description: "Couldn't reach the server. Your changes are queued and will sync automatically.",
          });
        }
      }
    }, 600);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state, saveToServerAsync]);

  // Apply preferences to document
  useEffect(() => {
    if (!state) return;
    document.documentElement.classList.toggle('dark', state.preferences.dark);
    document.documentElement.style.setProperty('--primary', hexToHsl(state.preferences.accent));
    if (state.preferences.fontStyle === 'classic') {
      document.documentElement.style.setProperty('--app-font-sans', "'Lora', Georgia, serif");
    } else if (state.preferences.fontStyle === 'rounded') {
      document.documentElement.style.setProperty('--app-font-sans', "'Nunito', sans-serif");
    } else {
      document.documentElement.style.setProperty('--app-font-sans', "'DM Sans', sans-serif");
    }
  }, [state?.preferences]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const update = useCallback((fn: (current: AppState) => AppState) =>
    setState((current) => current ? fn(current) : current), []);

  const toggleTask = useCallback((id: string) =>
    update((s) => ({ ...s, tasks: s.tasks.map((t) => t.id === id ? { ...t, done: !t.done } : t) })), [update]);

  const removeTask = useCallback((id: string) =>
    update((s) => ({
      ...s,
      tasks: s.tasks.filter((t) => t.id !== id),
      preferences: {
        ...s.preferences,
        dismissedDuplicates: (s.preferences.dismissedDuplicates ?? []).filter((key) => !key.includes(id)),
      },
    })), [update]);

  const addTask = useCallback((task: Omit<Task, 'id' | 'done'>) =>
    update((s) => ({ ...s, tasks: [{ ...task, id: `t${Date.now()}`, done: false }, ...s.tasks] })), [update]);

  const editTask = useCallback((id: string, patch: Partial<Task>) =>
    update((s) => ({ ...s, tasks: s.tasks.map((t) => t.id === id ? { ...t, ...patch } : t) })), [update]);

  const addPerson = useCallback((person: Omit<Person, 'id' | 'connections'>) =>
    update((s) => ({ ...s, people: [{ ...person, id: `p${Date.now()}`, connections: [] }, ...s.people] })), [update]);

  const editPerson = useCallback((id: string, patch: Partial<Omit<Person, 'id' | 'connections'>>) =>
    update((s) => ({ ...s, people: s.people.map((person) => person.id === id ? { ...person, ...patch } : person) })), [update]);

  const removePerson = useCallback((id: string) =>
    update((s) => ({ ...s, people: s.people.filter((person) => person.id !== id) })), [update]);

  const logConnection = useCallback((id: string, note?: string, method?: string) =>
    update((s) => ({
      ...s,
      people: s.people.map((person) => person.id === id ? {
        ...person,
        lastConnectedAt: new Date().toISOString(),
        connections: [{ id: `c${Date.now()}`, date: new Date().toISOString(), note: note?.trim() || undefined, method: method || undefined }, ...person.connections].slice(0, 30),
      } : person),
    })), [update]);

  const addCapture = useCallback((text: string) =>
    update((s) => ({ ...s, captures: [{ id: `c${Date.now()}`, text, createdAt: 'Just now', converted: false }, ...s.captures] })), [update]);

  const reset = useCallback(() => {
    // Reset to seed state — server will re-seed on next GET since we send it explicitly
    const seedState: AppState = {
      tasks: [
        { id: 't1', title: 'Send the revised proposal to Maya', project: 'Work rhythm', due: 'Today', time: '09:30', priority: 'high', done: false },
        { id: 't2', title: 'Book a quiet place for Friday', project: 'Personal', due: 'Today', time: '11:00', priority: 'medium', done: false },
        { id: 't3', title: 'Review the first three portfolio notes', project: 'Portfolio refresh', due: 'Today', time: '14:00', priority: 'medium', done: false },
        { id: 't4', title: 'Walk around the block before dinner', project: 'Personal', due: 'Today', time: '18:30', priority: 'low', done: false },
        { id: 't5', title: "Outline next week's priorities", project: 'Work rhythm', due: 'Tomorrow', priority: 'low', done: false },
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
      preferences: defaultPreferences,
      waitingFor: [],
      people: [],
    };
    setState(seedState);
    setNotice('Your sample day is back.');
  }, []);

  return { state, isLoading: isServerLoading || !state, update, toggleTask, removeTask, addTask, editTask, addCapture, addPerson, editPerson, removePerson, logConnection, reset, notice, setNotice };
}

function hexToHsl(hex: string) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16) / 255, g = parseInt(value.slice(2, 4), 16) / 255, b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return `0% 0% ${Math.round(l * 100)}%`;
  const d = max - min, s = l > .5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function useLiveDate() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const scheduleNextTick = () => {
      const current = new Date();
      const elapsedThisMinute = current.getSeconds() * 1000 + current.getMilliseconds();
      timer = setTimeout(() => {
        setNow(new Date());
        scheduleNextTick();
      }, 60_000 - elapsedThisMinute + 25);
    };

    scheduleNextTick();
    return () => clearTimeout(timer);
  }, []);

  return now;
}

function formatPersonDate(value?: string) {
  if (!value) return '';
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
}

function frequencyDays(person: Person) {
  if (person.frequency === 'weekly') return 7;
  if (person.frequency === 'biweekly') return 14;
  if (person.frequency === 'monthly') return 30;
  return person.frequency === 'custom' ? Math.max(1, person.customDays ?? 30) : Infinity;
}

function isPersonReadyForGentlePrompt(person: Person) {
  if (!person.lastConnectedAt || person.frequency === 'none' || (person.reminderSnoozedUntil && new Date(person.reminderSnoozedUntil).getTime() > Date.now())) return false;
  const daysSince = Math.floor((Date.now() - new Date(person.lastConnectedAt).getTime()) / 86400000);
  return daysSince >= frequencyDays(person);
}

function nextAnnualDate(value: string) {
  const source = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(source.getTime())) return null;
  const now = new Date();
  let candidate = new Date(now.getFullYear(), source.getMonth(), source.getDate(), 12);
  if (candidate.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime()) {
    candidate = new Date(now.getFullYear() + 1, source.getMonth(), source.getDate(), 12);
  }
  return Math.ceil((candidate.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime()) / 86400000);
}

function normalizeWords(value: string) {
  const ignored = new Set(['a', 'an', 'and', 'at', 'for', 'from', 'in', 'my', 'of', 'on', 'our', 'the', 'to', 'with']);
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((word) => word && !ignored.has(word));
}

function findPersonInText(text: string, people: Person[]) {
  const words = normalizeWords(text);
  return people.find((person) => {
    const aliases = [person.name, person.relationship].flatMap(normalizeWords).filter(Boolean);
    return aliases.some((alias) => alias.length > 0 && words.includes(alias));
  });
}

function Logo() {
  return <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div className="brand-mark">m</div><span className="brand-word">my day<span style={{ color: 'hsl(var(--primary))' }}>.</span></span></div>;
}

function navItems() {
  return [
    { href: '/', label: 'Today', icon: HomeIcon },
    { href: '/plan', label: 'Plan', icon: Calendar },
    { href: '/people', label: 'People', icon: UsersRound },
    { href: '/projects', label: 'Projects', icon: FolderKanban },
    { href: '/capture', label: 'Capture', icon: Brain },
  ];
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const items = navItems();
  return <div className="app-shell">
    <aside className="sidebar">
      <Logo />
      <nav className="sidebar-nav" aria-label="Main navigation">
        {items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-${label.toLowerCase()}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Today' && <span style={{ marginLeft: 'auto', fontFamily: 'var(--app-font-mono)', fontSize: 9, opacity: .5 }}>01</span>}</Link>)}
      </nav>
      <div className="sidebar-bottom">
        <Link href="/me" className={`nav-link ${location === '/me' ? 'active' : ''}`} data-testid="link-me"><Settings2 size={17} strokeWidth={1.8} /><span>Me & preferences</span></Link>
        <div className="mini-profile"><div className="avatar">S</div><div><strong style={{ display: 'block', fontSize: 12 }}>Satin</strong><span style={{ color: 'hsl(var(--sidebar-foreground) / .5)', fontSize: 10 }}>Tell me what matters.</span></div></div>
      </div>
    </aside>
    <div className="workspace">
      <div className="mobile-bar"><Logo /><Link href="/me" className="icon-button" aria-label="Open preferences" data-testid="link-mobile-me"><UserRound size={18} /></Link></div>
      <main>{children}</main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={location === href ? 'active' : ''} data-testid={`mobile-link-${label.toLowerCase()}`}><Icon size={18} /><span>{label}</span></Link>)}
      </nav>
    </div>
  </div>;
}

function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow: string; title: ReactNode; subtitle: string; action?: ReactNode }) {
  return <header className="page-header"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-subtitle">{subtitle}</p></div>{action}</header>;
}

function TaskRow({ task, numberBadge, onToggle, onDelete, onEdit, onReschedule }: { task: Task; numberBadge?: number; onToggle: () => void; onDelete?: () => void; onEdit?: () => void; onReschedule?: () => void }) {
  return <div className={`task-row ${task.done ? 'done' : ''}`} data-testid={`row-task-${task.id}`}>
    <input className="check" type="checkbox" checked={task.done} onChange={onToggle} aria-label={`${task.done ? 'Reopen' : 'Complete'} ${task.title}`} data-testid={`checkbox-task-${task.id}`} />
    <div>
      <div className="task-name">
        {numberBadge !== undefined && numberBadge <= 3 && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: 'hsl(var(--primary)/0.15)', color: 'hsl(var(--primary))', fontSize: 10, marginRight: 8, fontWeight: 700 }}>{numberBadge}</span>}
        {task.title}
      </div>
      <div className="task-meta"><span className={`priority-dot ${task.priority}`} /><span>{task.time || task.due}</span><span>·</span><span>{task.project}</span></div>
    </div>
    <div className="task-actions" style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {onReschedule && <button className="icon-button" onClick={onReschedule} aria-label={`Reschedule ${task.title}`} data-testid={`button-reschedule-${task.id}`}><CalendarClock size={15} /></button>}
      {onEdit && <button className="icon-button" onClick={onEdit} aria-label={`Edit ${task.title}`} data-testid={`button-edit-${task.id}`}><MoreHorizontal size={16} /></button>}
      {onDelete && <button className="icon-button" onClick={onDelete} aria-label={`Delete ${task.title}`} data-testid={`button-delete-${task.id}`}><Trash2 size={15} /></button>}
    </div>
  </div>;
}

function WhatNowSection({ remaining, hour }: { remaining: Task[]; hour: number }) {
  const [open, setOpen] = useState(false);
  let whatNowText = "";
  if (remaining.length === 0) {
    whatNowText = "Everything is handled. A genuine rest is the next step.";
  } else {
    const nextTaskTitle = remaining[0].title;
    if (hour < 12) {
      whatNowText = `Your clearest thinking is right now. Start with ${nextTaskTitle}.`;
    } else if (hour < 17) {
      whatNowText = `You've made it past the midpoint. A focused 25 minutes on ${nextTaskTitle} will carry you through.`;
    } else {
      whatNowText = `Wind down deliberately. One small task — ${nextTaskTitle} — then protect your evening.`;
    }
  }

  return (
    <section key="whatnow">
      {open ? (
        <div className="card" style={{ padding: 22, border: '2px solid hsl(var(--primary))' }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Right now</h2>
          <p style={{ color: 'hsl(var(--foreground))', fontSize: 14, lineHeight: 1.5 }}>{whatNowText}</p>
          <button className="button button-ghost" style={{ marginTop: 12, minHeight: 36, padding: '0 12px' }} onClick={() => setOpen(false)}>Close</button>
        </div>
      ) : (
        <button className="button button-secondary" style={{ width: '100%', minHeight: 56, fontSize: 15, borderRadius: 16, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }} onClick={() => setOpen(true)}>
          What should I do right now?
        </button>
      )}
    </section>
  );
}

function Home({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, toggleTask, removeTask, update, setNotice } = app;
  const now = useLiveDate();
  const { data: todayCalendarEvents } = useGetCalendarEvents({ date: localDateKey(now) });
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const { data: tomorrowCalendarEvents } = useGetCalendarEvents({ date: localDateKey(tomorrowDate) });
  const [overwhelmed, setOverwhelmed] = useState(false);
  const [captureText, setCaptureText] = useState('');
  if (!state) return null;
  const remaining = state.tasks.filter((task) => !task.done && task.due === 'Today');
  const next = remaining[0];
  const completed = state.tasks.filter((task) => task.done).length;
  const calendarTitles = ([...(todayCalendarEvents ?? []), ...(tomorrowCalendarEvents ?? [])] as Array<{ title: string }>).map((event) => normalizeWords(event.title));
  const checkInPeople = state.people.filter((person) => isPersonReadyForGentlePrompt(person) && !calendarTitles.some((title) => {
    const personWords = normalizeWords(person.name);
    return personWords.length > 0 && personWords.every((word) => title.includes(word));
  })).slice(0, 2);
  
  const hour = now.getHours();
  let greeting = "Good evening";
  if (hour < 12) greeting = "Good morning";
  else if (hour < 17) greeting = "Good afternoon";

  const submitCapture = () => {
    if (!captureText.trim()) return;
    app.addCapture(captureText.trim());
    setCaptureText('');
    setNotice('Held onto that thought.');
  };

  if (overwhelmed) return <div className="page-wrap"><PageHeader eyebrow="A softer view" title={<>One thing, <span className="serif">Satin.</span></>} subtitle="You don't have to handle everything. Just this one." action={<button className="button button-secondary" onClick={() => setOverwhelmed(false)} data-testid="button-return-normal"><ArrowLeft size={15} /> Return to my day</button>} /><div className="card overwhelm-card" style={{ maxWidth: 650, minHeight: 360, margin: '10vh auto 0' }}><div><div className="eyebrow">Your next gentle step</div><h2>{next ? next.title : 'The day is already held.'}</h2><p>{next ? "That's it. The rest is background noise for now." : "You have moved through today's list. A pause is a perfectly good next step."}</p></div><div><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{next && <button className="button button-primary" onClick={() => { toggleTask(next.id); setNotice('That is enough for now.'); }} data-testid="button-complete-next"><Check size={15} /> Mark it complete</button>}<button className="button" style={{ background: 'hsl(var(--sidebar-foreground) / .12)', color: 'inherit' }} onClick={() => setOverwhelmed(false)} data-testid="button-see-day">See my full day</button></div><div style={{ marginTop: 40, borderTop: '1px solid hsl(var(--border))', paddingTop: 20 }}><p style={{ fontStyle: 'italic', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>"{QUOTES[Math.floor(Math.random() * QUOTES.length)]}"</p></div></div></div></div>;

  const renderSection = (name: string) => {
    if (name === 'briefing') return (
      <section key="briefing" className="card briefing" data-testid="card-ai-briefing"><div className="briefing-top"><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="status-dot" /><span className="eyebrow" style={{ color: 'hsl(var(--muted-foreground))' }}>Your morning briefing</span></div><Sparkles size={18} color="hsl(var(--primary))" /></div><h2>You have a clear first move, and a little room after it.</h2><p>Start with Maya's proposal while your thinking is fresh. The booking can follow. I've kept the afternoon lighter so the portfolio work does not become another mountain.</p><div className="briefing-actions"><Link href="/plan" className="button button-primary" data-testid="link-open-plan"><Calendar size={15} /> Open today's plan</Link><Link href="/capture" className="button button-ghost" data-testid="link-open-capture"><Plus size={15} /> Add a thought</Link></div></section>
    );
    if (name === 'whatnow') return <WhatNowSection key="whatnow" remaining={remaining} hour={hour} />;
    if (name === 'priorities') {
      const showBanner = remaining.length > 5;
      return (
        <section key="priorities"><div className="section-title"><h2>Worth your attention</h2><span>{completed} complete</span></div>{showBanner && <div className="card" style={{ padding: '14px 18px', marginBottom: 16, background: 'hsl(var(--primary)/0.1)', borderColor: 'hsl(var(--primary)/0.2)' }}><p style={{ fontSize: 13, margin: 0, color: 'hsl(var(--foreground))' }}>You have {remaining.length} things on your list. You realistically have time for 5 today. Here's what I'd prioritize.</p></div>}<div className="task-list">{remaining.slice(0, 5).map((task, idx) => <TaskRow key={task.id} task={task} numberBadge={idx + 1} onToggle={() => toggleTask(task.id)} onDelete={() => { removeTask(task.id); setNotice('Task removed.'); }} onReschedule={() => { update((s) => ({ ...s, tasks: s.tasks.map((t) => t.id === task.id ? { ...t, due: 'Tomorrow', time: undefined } : t) })); setNotice('Moved to tomorrow.'); }} />)}{remaining.length === 0 && <div className="empty-state"><CheckCircle2 size={23} /><div>Today is clear enough. Notice how that feels.</div><Link href="/plan" className="button button-secondary" style={{ marginTop: 15 }} data-testid="link-review-completed">Review the plan</Link></div>}</div></section>
      );
    }
    if (name === 'capture') return (
      <section key="capture" className="card capture-box"><div className="section-title"><h2>Put it somewhere safe</h2><span>Nothing gets lost here</span></div><textarea className="capture-input" placeholder="A thought, a worry, a thing to remember…" value={captureText} onChange={(event) => setCaptureText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submitCapture(); }} aria-label="Quick capture" data-testid="textarea-quick-capture" /><div className="capture-footer"><span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 10 }}><Command size={12} style={{ verticalAlign: 'middle' }} /> + Enter to save</span><button className="button button-primary" onClick={submitCapture} disabled={!captureText.trim()} data-testid="button-save-capture">Hold onto it <ArrowRight size={14} /></button></div></section>
    );
    if (name === 'timeline') return (
      <section key="timeline" className="card timeline"><div className="section-title"><h2>Your shape of today</h2><span>Local time</span></div><div>{[['09:30', 'Send the revised proposal', 'Work rhythm'], ['11:00', 'Book a quiet place', 'Personal'], ['14:00', 'Portfolio notes', 'Portfolio refresh'], ['18:30', 'A walk before dinner', 'Personal']].map(([time, title, project], index) => <div className="timeline-item" key={title}><div className="timeline-time">{time}</div><div className="timeline-track"><span className="timeline-node" /><span className="timeline-line" /></div><div className="timeline-copy"><strong>{title}</strong><p>{project}</p></div></div>)}</div></section>
    );
    if (name === 'quote') {
      const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
      const dailyQuote = QUOTES[dayOfYear % QUOTES.length];
      return (
        <section key="quote" className="soft-card" style={{ padding: 24, position: 'relative' }}><div style={{ fontSize: 60, fontFamily: 'var(--app-font-serif)', color: 'hsl(var(--primary))', opacity: 0.2, position: 'absolute', top: -5, left: 16, lineHeight: 1 }}>"</div><p style={{ position: 'relative', zIndex: 1, fontSize: 16, fontFamily: 'var(--app-font-serif)', lineHeight: 1.4, margin: '10px 0 0', fontStyle: 'italic' }}>{dailyQuote}</p></section>
      );
    }
    return null;
  };

  const leftNames = state.preferences.sectionOrder.filter(n => ['briefing', 'whatnow', 'priorities', 'capture'].includes(n));
  const rightNames = state.preferences.sectionOrder.filter(n => ['timeline', 'quote'].includes(n));

  return <div className="page-wrap">
     <PageHeader eyebrow={now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} title={<>{greeting}, <span className="serif">Satin.</span></>} subtitle={`${remaining.length} things worth your attention today. We can make room for them.`} action={<button className="button button-secondary" onClick={() => setOverwhelmed(true)} data-testid="button-overwhelmed"><CircleHelp size={15} /> I'm overwhelmed</button>} />
    {checkInPeople.length > 0 && <section className="card connection-nudge" data-testid="card-stay-connected"><div className="connection-nudge-icon"><HeartHandshake size={18} /></div><div><div className="eyebrow">Stay connected</div><h2>{checkInPeople.length === 1 ? `${checkInPeople[0].name} has been on your mind.` : 'A couple of people are on your mind.'}</h2><p>It’s been a little while. Want to check in, in whatever way feels natural?</p><Link className="button button-secondary" href="/people" data-testid="link-stay-connected">See people</Link></div></section>}
    <div className="grid-home">
      <div className="stack">
        {leftNames.map(renderSection)}
      </div>
      <div className="stack">
        <section className="card overwhelm-card"><div><div className="eyebrow">When the list feels loud</div><h2>Let's make it smaller.</h2><p>There is no prize for carrying every open loop at the same time.</p><div className="next-step"><span>Try this next</span><strong>{next?.title || 'Take a real pause'}</strong></div></div><button className="button" style={{ background: 'hsl(var(--sidebar-foreground) / .12)', color: 'inherit', width: 'fit-content' }} onClick={() => setOverwhelmed(true)} data-testid="button-simplify-day"><WandSparkles size={15} /> Simplify my day</button></section>
        {rightNames.map(renderSection)}
      </div>
    </div>
    <Link href="/capture" className="floating-mic" aria-label="Voice capture">
      <Mic size={24} color="hsl(var(--primary-foreground))" />
    </Link>
  </div>;
}

function TaskModal({ initial, onClose, onSave }: { initial?: Task; onClose: () => void; onSave: (task: Omit<Task, 'id' | 'done'>) => void }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [project, setProject] = useState(initial?.project || 'Personal');
  const [due, setDue] = useState(initial?.due || 'Today');
  const [time, setTime] = useState(initial?.time || '');
  const [estTime, setEstTime] = useState(initial?.estTime || '15 min');
  const [priority, setPriority] = useState<Task['priority']>(initial?.priority || 'medium');
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title"><div className="modal-head"><h2 id="task-modal-title">{initial ? 'Shape this task' : 'Add a task'}</h2><button className="icon-button" onClick={onClose} aria-label="Close task form" data-testid="button-close-task-form"><X size={18} /></button></div><form className="form-stack" onSubmit={(event) => { event.preventDefault(); if (title.trim()) onSave({ title: title.trim(), project, due, time: time || undefined, estTime, priority }); }}><div><label className="field-label" htmlFor="task-title">What needs doing?</label><input id="task-title" autoFocus className="field" value={title} onChange={(event) => setTitle(event.target.value)} data-testid="input-task-title" /></div><div><label className="field-label" htmlFor="task-project">Area</label><input id="task-project" className="field" value={project} onChange={(event) => setProject(event.target.value)} data-testid="input-task-project" /></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><div><label className="field-label" htmlFor="task-due">When</label><select id="task-due" className="field" value={due} onChange={(event) => setDue(event.target.value)} data-testid="select-task-due"><option>Today</option><option>Tomorrow</option><option>Friday</option><option>Someday</option></select></div><div><label className="field-label" htmlFor="task-time">Time <span style={{ fontWeight: 400 }}>(optional)</span></label><input id="task-time" type="time" className="field" value={time} onChange={(event) => setTime(event.target.value)} data-testid="input-task-time" /></div></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><div><label className="field-label" htmlFor="task-estTime">Estimated time</label><select id="task-estTime" className="field" value={estTime} onChange={(event) => setEstTime(event.target.value)} data-testid="select-task-est-time"><option>5 min</option><option>15 min</option><option>30 min</option><option>1 hour</option><option>2+ hours</option></select></div><div><label className="field-label" htmlFor="task-priority">Energy level</label><select id="task-priority" className="field" value={priority} onChange={(event) => setPriority(event.target.value as Task['priority'])} data-testid="select-task-priority"><option value="high">High focus</option><option value="medium">Medium focus</option><option value="low">Low focus</option></select></div></div><div className="form-actions"><button type="button" className="button button-ghost" onClick={onClose} data-testid="button-cancel-task">Cancel</button><button className="button button-primary" type="submit" data-testid="button-save-task">{initial ? 'Save changes' : 'Add to plan'}</button></div></form></div></div>;
}

function PersonModal({ initial, onClose, onSave }: { initial?: Person; onClose: () => void; onSave: (person: Omit<Person, 'id' | 'connections'>) => void }) {
  const [name, setName] = useState(initial?.name || '');
  const [relationship, setRelationship] = useState(initial?.relationship || '');
  const [contactMethod, setContactMethod] = useState(initial?.contactMethod || 'Text');
  const [frequency, setFrequency] = useState<Person['frequency']>(initial?.frequency || 'monthly');
  const [customDays, setCustomDays] = useState(String(initial?.customDays || 30));
  const [birthday, setBirthday] = useState(initial?.birthday || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [importantDates, setImportantDates] = useState<ImportantDate[]>(initial?.importantDates || []);
  const [dateLabel, setDateLabel] = useState('');
  const [dateValue, setDateValue] = useState('');

  const addImportantDate = () => {
    if (!dateLabel.trim() || !dateValue) return;
    setImportantDates((dates) => [...dates, { id: `d${Date.now()}`, label: dateLabel.trim(), date: dateValue }]);
    setDateLabel('');
    setDateValue('');
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div className="modal people-modal" role="dialog" aria-modal="true" aria-labelledby="person-modal-title">
      <div className="modal-head"><div><h2 id="person-modal-title">{initial ? 'Shape this connection' : 'Add someone important'}</h2><p style={{ margin: '5px 0 0', color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>Just enough context to make staying close feel easy.</p></div><button className="icon-button" onClick={onClose} aria-label="Close person form"><X size={18} /></button></div>
      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; onSave({ name: name.trim(), relationship: relationship.trim(), contactMethod, frequency, customDays: frequency === 'custom' ? Math.max(1, Number(customDays) || 30) : undefined, birthday: birthday || undefined, importantDates, notes: notes.trim() }); }}>
        <div><label className="field-label" htmlFor="person-name">Name</label><input id="person-name" autoFocus className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Sarah" data-testid="input-person-name" /></div>
        <div className="person-form-grid"><div><label className="field-label" htmlFor="person-relationship">Who are they?</label><input id="person-relationship" className="field" value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder="Sister, friend, mentor…" data-testid="input-person-relationship" /></div><div><label className="field-label" htmlFor="person-contact-method">Favorite way to connect</label><select id="person-contact-method" className="field" value={contactMethod} onChange={(event) => setContactMethod(event.target.value)} data-testid="select-person-contact-method"><option>Text</option><option>Call</option><option>Voice note</option><option>Email</option><option>In person</option></select></div></div>
        <div className="person-form-grid"><div><label className="field-label" htmlFor="person-frequency">A natural rhythm</label><select id="person-frequency" className="field" value={frequency} onChange={(event) => setFrequency(event.target.value as Person['frequency'])} data-testid="select-person-frequency"><option value="weekly">Every week</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Every month</option><option value="custom">Custom</option><option value="none">No reminders</option></select></div>{frequency === 'custom' ? <div><label className="field-label" htmlFor="person-custom-days">Every how many days?</label><input id="person-custom-days" type="number" min="1" className="field" value={customDays} onChange={(event) => setCustomDays(event.target.value)} data-testid="input-person-custom-days" /></div> : <div />}
        </div>
        <div><label className="field-label" htmlFor="person-birthday">Birthday <span style={{ fontWeight: 400 }}>(optional)</span></label><input id="person-birthday" type="date" className="field" value={birthday} onChange={(event) => setBirthday(event.target.value)} data-testid="input-person-birthday" /></div>
        <div className="important-date-editor"><label className="field-label">Other important dates</label><div className="person-form-grid"><input className="field" value={dateLabel} onChange={(event) => setDateLabel(event.target.value)} placeholder="Anniversary, graduation…" aria-label="Important date name" /><input type="date" className="field" value={dateValue} onChange={(event) => setDateValue(event.target.value)} aria-label="Important date" /><button type="button" className="button button-secondary" onClick={addImportantDate} aria-label="Add important date"><Plus size={15} /></button></div>{importantDates.length > 0 && <div className="important-date-list">{importantDates.map((date) => <div className="important-date-row" key={date.id}><span><strong>{date.label}</strong> · {formatPersonDate(date.date)}</span><button type="button" className="icon-button" onClick={() => setImportantDates((dates) => dates.filter((item) => item.id !== date.id))} aria-label={`Remove ${date.label}`}><X size={14} /></button></div>)}</div>}</div>
        <div><label className="field-label" htmlFor="person-notes">A little context <span style={{ fontWeight: 400 }}>(optional)</span></label><textarea id="person-notes" className="field person-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What are they into lately? What makes them feel cared for?" data-testid="textarea-person-notes" /></div>
        <div className="form-actions"><button type="button" className="button button-ghost" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" data-testid="button-save-person">{initial ? 'Save changes' : 'Add person'}</button></div>
      </form>
    </div>
  </div>;
}

function personEventMatch(person: Person, titles: string[][]) {
  const personWords = normalizeWords(person.name);
  return personWords.length > 0 && titles.some((title) => personWords.every((word) => title.includes(word)));
}

function People({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, addPerson, editPerson, removePerson, logConnection, setNotice } = app;
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<{ open: boolean; person?: Person }>({ open: false });
  const { data: todayCalendarEvents } = useGetCalendarEvents({ date: localDateKey(new Date()) });
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const { data: tomorrowCalendarEvents } = useGetCalendarEvents({ date: localDateKey(tomorrowDate) });

  if (!state) return null;

  const calendarTitles = ([...(todayCalendarEvents ?? []), ...(tomorrowCalendarEvents ?? [])] as Array<{ title: string }>).map((event) => normalizeWords(event.title));
  const people = state.people.filter((person) => person.name.toLowerCase().includes(query.toLowerCase()) || person.relationship.toLowerCase().includes(query.toLowerCase()));
  const savePerson = (data: Omit<Person, 'id' | 'connections'>) => {
    if (modal.person) {
      editPerson(modal.person.id, data);
      setNotice('Connection details saved.');
    } else {
      addPerson(data);
      setNotice(`${data.name} is now in your people.`);
    }
    setModal({ open: false });
  };

  return <div className="page-wrap">
    <PageHeader eyebrow="The people who matter" title={<>Stay close, <span className="serif">gently.</span></>} subtitle="A private little place for the people you never want to lose track of." action={<button className="button button-primary" onClick={() => setModal({ open: true })} data-testid="button-add-person"><Plus size={16} /> Add someone</button>} />
    <div className="people-intro soft-card"><div className="people-intro-icon"><HeartHandshake size={20} /></div><div><strong>Think of someone. Tell My Day.</strong><p>Say “I just talked to Sarah” in Capture and their last connection is handled for you.</p></div><Link className="button button-secondary" href="/capture" data-testid="link-people-capture"><MessageCircle size={15} /> Tell My Day</Link></div>
    <div className="people-toolbar"><div className="search-field"><Search size={15} /><input className="field" type="search" placeholder="Find someone…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search people" data-testid="input-search-people" /></div><button className="button button-secondary people-add-mobile" onClick={() => setModal({ open: true })}><Plus size={15} /> Add someone</button></div>
    {people.length === 0 ? <div className="empty-state people-empty"><UsersRound size={25} /><h2>{state.people.length === 0 ? 'Your people are welcome here.' : 'No one by that name yet.'}</h2><p>{state.people.length === 0 ? 'Add a few people you want to keep close. No importing, no scoring, no pressure.' : 'Try another name or add someone new.'}</p>{state.people.length === 0 && <button className="button button-primary" onClick={() => setModal({ open: true })}><Plus size={15} /> Add someone</button>}</div> : <div className="people-grid">{people.map((person) => {
      const due = isPersonReadyForGentlePrompt(person);
      const hasPlan = personEventMatch(person, calendarTitles);
      const latest = person.lastConnectedAt ? formatPersonDate(person.lastConnectedAt) : 'Not logged yet';
      const upcomingDate = [...(person.birthday ? [{ label: 'Birthday', date: person.birthday }] : []), ...person.importantDates].map((date) => ({ ...date, days: nextAnnualDate(date.date) })).filter((date): date is typeof date & { days: number } => date.days !== null && date.days <= 30).sort((a, b) => a.days - b.days)[0];
      return <article className="card person-card" key={person.id} data-testid={`card-person-${person.id}`}>
        <div className="person-card-head"><div className="person-avatar">{person.name.slice(0, 1).toUpperCase()}</div><div className="person-card-actions"><button className="icon-button" onClick={() => setModal({ open: true, person })} aria-label={`Edit ${person.name}`}><MoreHorizontal size={17} /></button><button className="icon-button" onClick={() => { removePerson(person.id); setNotice(`${person.name} removed from your people.`); }} aria-label={`Remove ${person.name}`}><Trash2 size={15} /></button></div></div>
        <h2>{person.name}</h2><p className="person-relationship">{person.relationship || 'Someone important'}</p>
        <div className="person-last"><span className="eyebrow">Last connection</span><strong>{latest}</strong></div>
        {due && !hasPlan && <div className="person-prompt"><HeartHandshake size={14} /><span>It’s been a little while. A small hello would be lovely.</span><button className="person-prompt-dismiss" onClick={() => { editPerson(person.id, { reminderSnoozedUntil: new Date(Date.now() + 7 * 86400000).toISOString() }); setNotice('Okay — I’ll give this some room.'); }} aria-label={`Remind me later about ${person.name}`}>Not now</button></div>}
        {hasPlan && <div className="person-plan-note"><CalendarDays size={14} /> You have a plan together today.</div>}
        {upcomingDate && <div className="person-date-note"><Cake size={14} /> {upcomingDate.label} {upcomingDate.days === 0 ? 'is today.' : `is in ${upcomingDate.days} ${upcomingDate.days === 1 ? 'day' : 'days'}.`}</div>}
        <div className="person-details">{person.contactMethod && <span>{person.contactMethod === 'Call' ? <Phone size={13} /> : person.contactMethod === 'Email' ? <Mail size={13} /> : <MessageCircle size={13} />}{person.contactMethod}</span>}{person.frequency !== 'none' && <span><Bell size={13} />{person.frequency === 'custom' ? `Every ${person.customDays} days` : person.frequency === 'biweekly' ? 'Every 2 weeks' : person.frequency === 'weekly' ? 'Every week' : 'Every month'}</span>}</div>
        {(person.birthday || person.importantDates.length > 0) && <div className="person-dates">{person.birthday && <span><Cake size={13} /> {formatPersonDate(person.birthday)}</span>}{person.importantDates.map((date) => <span key={date.id}><CalendarDays size={13} /> {date.label} · {formatPersonDate(date.date)}</span>)}</div>}
        {person.notes && <p className="person-notes-preview">“{person.notes}”</p>}
        <button className="button button-primary log-connection-button" onClick={() => { logConnection(person.id, undefined, person.contactMethod); setNotice(`Connection with ${person.name} logged.`); }} data-testid={`button-log-connection-${person.id}`}><HeartHandshake size={15} /> Log connection</button>
      </article>;
    })}</div>}
    {modal.open && <PersonModal initial={modal.person} onClose={() => setModal({ open: false })} onSave={savePerson} />}
  </div>;
}

type DuplicatePair = {
  id: string;
  left: { kind: 'Task'; title: string; detail: string };
  right: { kind: 'Task' | 'Calendar event'; title: string; detail: string };
  removeTaskId?: string;
  removeTaskTitle?: string;
};

function titleSimilarity(first: string, second: string) {
  const a = normalizeWords(first);
  const b = normalizeWords(second);
  if (a.length === 0 || b.length === 0) return 0;
  if ((a.length === 1 && b.length === 1) || (a.length === 1 && b.includes(a[0])) || (b.length === 1 && a.includes(b[0]))) return 0;
  const aText = a.join(' ');
  const bText = b.join(' ');
  if (aText === bText) return 1;
  const aBigrams = new Set(a.slice(0, -1).map((word, index) => `${word} ${a[index + 1]}`));
  const bBigrams = new Set(b.slice(0, -1).map((word, index) => `${word} ${b[index + 1]}`));
  if (aBigrams.size === 0 || bBigrams.size === 0) return 0;
  let overlap = 0;
  aBigrams.forEach((bigram) => { if (bBigrams.has(bigram)) overlap += 1; });
  return (2 * overlap) / (aBigrams.size + bBigrams.size);
}

function findDuplicatePairs(tasks: Task[], events: Array<{ id: string; title: string; start: string; allDay: boolean }>) {
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < tasks.length; i += 1) {
    for (let j = i + 1; j < tasks.length; j += 1) {
      if (titleSimilarity(tasks[i].title, tasks[j].title) > 0.8) {
        pairs.push({
          id: `task:${tasks[i].id}:${normalizeWords(tasks[i].title).join('-')}|task:${tasks[j].id}:${normalizeWords(tasks[j].title).join('-')}`,
          left: { kind: 'Task', title: tasks[i].title, detail: `${tasks[i].due} · ${tasks[i].project}` },
          right: { kind: 'Task', title: tasks[j].title, detail: `${tasks[j].due} · ${tasks[j].project}` },
          removeTaskId: tasks[j].id,
          removeTaskTitle: tasks[j].title,
        });
      }
    }
    events.forEach((event) => {
      if (titleSimilarity(tasks[i].title, event.title) > 0.8) {
        pairs.push({
          id: `task:${tasks[i].id}:${normalizeWords(tasks[i].title).join('-')}|event:${event.id}:${normalizeWords(event.title).join('-')}`,
          left: { kind: 'Task', title: tasks[i].title, detail: `${tasks[i].due} · ${tasks[i].project}` },
          right: { kind: 'Calendar event', title: event.title, detail: event.allDay ? 'All day' : new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
          removeTaskId: tasks[i].id,
          removeTaskTitle: tasks[i].title,
        });
      }
    });
  }
  return pairs;
}

function DuplicateReviewModal({ pairs, onClose, onKeepBoth, onRemoveTask }: { pairs: DuplicatePair[]; onClose: () => void; onKeepBoth: (id: string) => void; onRemoveTask: (pair: DuplicatePair) => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div className="modal duplicate-modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-modal-title">
      <div className="modal-head"><div><h2 id="duplicate-modal-title">A little overlap</h2><p style={{ margin: '5px 0 0', color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>Keep what feels useful. Nothing changes unless you choose it.</p></div><button className="icon-button" onClick={onClose} aria-label="Close duplicate review"><X size={18} /></button></div>
      <div className="duplicate-list">{pairs.map((pair) => <div className="duplicate-pair" key={pair.id}><div className="duplicate-columns"><div><span className="eyebrow">{pair.left.kind}</span><strong>{pair.left.title}</strong><small>{pair.left.detail}</small></div><div className="duplicate-bridge"><HeartHandshake size={14} /></div><div><span className="eyebrow">{pair.right.kind}</span><strong>{pair.right.title}</strong><small>{pair.right.detail}</small></div></div><div className="duplicate-actions"><button className="button button-ghost" onClick={() => onKeepBoth(pair.id)}>Keep both</button>{pair.removeTaskId && <button className="button button-secondary" onClick={() => onRemoveTask(pair)}>Remove {pair.removeTaskTitle}</button>}<button className="button button-ghost" onClick={() => onKeepBoth(pair.id)}>Ignore suggestion</button></div></div>)}</div>
      <div className="form-actions"><button className="button button-secondary" onClick={onClose}>Done</button></div>
    </div>
  </div>;
}

function Plan({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, toggleTask, removeTask, addTask, editTask, setNotice, update } = app;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [modal, setModal] = useState<{ open: boolean; task?: Task }>({ open: false });

  // Real Google Calendar data — navigable week
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = (() => {
    const now = new Date();
    const dow = now.getDay();
    const diff = dow === 0 ? -6 : 1 - dow; // shift to Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);
    return monday;
  })();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);

  // Selected day drives the event list; defaults to today
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });

  // When the week changes, auto-select today if visible, otherwise the week start
  useEffect(() => {
    const todayInNewWeek = weekDays.find(d => d.getTime() === todayMidnight.getTime());
    setSelectedDay(todayInNewWeek ?? new Date(weekStart));
  }, [weekOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  // Use local date components to avoid UTC offset shifting the date string
  const localDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const eventsDate = localDateStr(selectedDay);
  const weekMonthLabel = (() => {
    const last = weekDays[6];
    if (last.getMonth() !== weekStart.getMonth()) {
      return `${weekStart.toLocaleString('default', { month: 'short' })} – ${last.toLocaleString('default', { month: 'long', year: 'numeric' })}`;
    }
    return weekStart.toLocaleString('default', { month: 'long', year: 'numeric' });
  })();
  const today = localDateStr(new Date());
  const eventsDateLabel = eventsDate === today
    ? 'Today'
    : new Date(eventsDate + 'T00:00:00').toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' });
  const { data: calendarList } = useGetCalendarList();
  const { data: calendarEvents, isLoading: calEventsLoading } = useGetCalendarEvents({ date: eventsDate });
  const { data: calendarStatus } = useGetCalendarStatus();
  const weekStartStr = localDateStr(weekStart);
  const { data: weekSummary } = useGetCalendarWeekSummary({ weekStart: weekStartStr });

  // Auto-mark calendar as connected when the API confirms it
  useEffect(() => {
    if (calendarStatus && (calendarStatus as { connected: boolean }).connected && state?.preferences.calendarConnected === 'none') {
      update(s => ({ ...s, preferences: { ...s.preferences, calendarConnected: 'google' as const } }));
    }
  }, [calendarStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  const [waitingName, setWaitingName] = useState('');
  const [waitingItem, setWaitingItem] = useState('');

  if (!state) return null;

  const visibleEvents = (calendarEvents as Array<{ id: string; title: string; start: string; end: string; allDay: boolean; calendarColor?: string | null; calendarId?: string }> ?? []).filter(ev => {
    const pref = state.preferences.calendarPrefs?.[ev.calendarId ?? ''];
    return pref === undefined || pref.visible !== false;
  });

  const visible = state.tasks.filter((task) => (filter === 'All' || task.due === filter || (filter === 'Open' && !task.done) || (filter === 'Done' && task.done)) && task.title.toLowerCase().includes(query.toLowerCase()));
  
  const saveTask = (data: Omit<Task, 'id' | 'done'>) => {
    if (modal.task) editTask(modal.task.id, data); else addTask(data);
    setModal({ open: false }); setNotice(modal.task ? 'Task updated.' : 'Added to your plan.');
  };

  const addWaiting = () => {
    if (!waitingName.trim() || !waitingItem.trim()) return;
    app.update(s => ({
      ...s,
      waitingFor: [...(s.waitingFor || []), { id: `w${Date.now()}`, person: waitingName.trim(), item: waitingItem.trim(), addedAt: new Date().toISOString() }]
    }));
    setWaitingName('');
    setWaitingItem('');
    setNotice('Added to Waiting For.');
  };

  const removeWaiting = (id: string) => {
    app.update(s => ({ ...s, waitingFor: s.waitingFor.filter(w => w.id !== id) }));
  };

  return <div className="page-wrap"><PageHeader eyebrow="The week, in view" title={<>Make a plan that <span className="serif">breathes.</span></>} subtitle="A flexible shape for the things you want to move forward." action={<button className="button button-primary" onClick={() => setModal({ open: true })} data-testid="button-add-task"><Plus size={16} /> Add task</button>} /><div className="plan-toolbar"><div className="search-field"><Search size={15} /><input className="field" type="search" placeholder="Find a task…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search tasks" data-testid="input-search-tasks" /></div><select className="field select-field" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter tasks" data-testid="select-filter-tasks"><option>All</option><option>Open</option><option>Done</option><option>Today</option><option>Tomorrow</option></select><button className="button button-secondary" onClick={() => setModal({ open: true })} data-testid="button-add-task-toolbar"><Plus size={15} /> New task</button></div><div className="plan-grid"><section><div className="section-title"><h2>{filter === 'All' ? 'All open loops' : `${filter} tasks`}</h2><span>{visible.length} {visible.length === 1 ? 'task' : 'tasks'}</span></div><div className="task-list">{visible.map((task) => <TaskRow key={task.id} task={task} onToggle={() => { toggleTask(task.id); setNotice(task.done ? 'Back on the list.' : 'Nice. One less thing to carry.'); }} onDelete={() => { removeTask(task.id); setNotice('Task removed.'); }} onEdit={() => setModal({ open: true, task })} onReschedule={() => { update((s) => ({ ...s, tasks: s.tasks.map((t) => t.id === task.id ? { ...t, due: t.due === 'Today' ? 'Tomorrow' : 'Today' } : t) })); setNotice(task.due === 'Today' ? 'Moved to tomorrow.' : 'Brought back to today.'); }} />)}{visible.length === 0 && <div className="empty-state"><Search size={22} /><div>No tasks match that view.</div><button className="button button-ghost" onClick={() => { setQuery(''); setFilter('All'); }} data-testid="button-clear-task-filter">Clear filters</button></div>}</div>
      <div style={{ marginTop: 40 }}><div className="section-title"><h2>Waiting For</h2><span>Keep track of dependencies</span></div><div className="task-list">{(state.waitingFor || []).map(w => <div key={w.id} className="task-row" style={{ gridTemplateColumns: '1fr auto', padding: '12px 16px' }}><div><strong style={{ fontSize: 13, display: 'block' }}>{w.person}</strong><span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', display: 'block', marginTop: 2 }}>{w.item}</span></div><button className="icon-button" onClick={() => removeWaiting(w.id)}><Check size={16} /></button></div>)}<div className="task-row" style={{ gridTemplateColumns: '1fr 1.5fr auto', padding: '8px 12px', gap: 8, background: 'transparent' }}><input className="field" placeholder="Who?" value={waitingName} onChange={e => setWaitingName(e.target.value)} /><input className="field" placeholder="Waiting for what?" value={waitingItem} onChange={e => setWaitingItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addWaiting()} /><button className="button button-primary" style={{ minHeight: 36, padding: '0 12px' }} onClick={addWaiting}><Plus size={16} /></button></div></div></div></section><aside className="stack"><section className="card calendar-card"><div className="calendar-head"><button className="icon-button" onClick={() => setWeekOffset(o => o - 1)} aria-label="Previous week" data-testid="button-previous-week"><ArrowLeft size={16} /></button><strong>{weekMonthLabel}</strong><button className="icon-button" onClick={() => setWeekOffset(o => o + 1)} aria-label="Next week" data-testid="button-next-week"><ArrowRight size={16} /></button></div><div className="week-grid">{weekDays.map((day, index) => { const isToday = day.getTime() === todayMidnight.getTime(); const isSelected = day.getTime() === selectedDay.getTime(); return <div className={`day-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`} key={index} role="button" tabIndex={0} aria-label={day.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' })} aria-pressed={isSelected} onClick={() => setSelectedDay(new Date(day))} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSelectedDay(new Date(day))}><span>{['M','T','W','T','F','S','S'][index]}</span><b>{day.getDate()}</b>{weekSummary && (weekSummary as Record<string, number>)[localDateStr(day)] > 0 && <span className="day-event-dot" aria-hidden="true" />}</div>; })}</div><div style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--foreground))', padding: '10px 0 4px' }}>{eventsDateLabel}</div>{calEventsLoading && <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', padding: '4px 0' }}>Loading calendar…</div>}{!calEventsLoading && calendarEvents && visibleEvents.length === 0 && <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', padding: '4px 0' }}>No events {eventsDateLabel === 'Today' ? 'today' : `on ${eventsDateLabel}`}.</div>}{!calEventsLoading && calendarEvents && visibleEvents.map((ev, i) => { const startTime = ev.allDay ? 'All day' : new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); const endTime = ev.allDay ? '' : new Date(ev.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); const userColor = state.preferences.calendarPrefs?.[ev.calendarId ?? '']?.color; const borderColor = userColor ?? ev.calendarColor ?? 'hsl(var(--primary))'; return <div className="calendar-event" key={ev.id} style={{ borderLeftColor: borderColor }}><strong>{ev.title}</strong><span>{eventsDateLabel} · {startTime}{endTime && !ev.allDay ? ` — ${endTime}` : ''}</span></div>; })}{!calEventsLoading && !calendarEvents && <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', padding: '8px 0' }}>Could not load calendar events.</div>}</section><section className="card calendar-card"><div className="section-title"><h2>Connected services</h2></div>{state.preferences.calendarConnected === 'none' ? (<div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}><button className="button button-ghost" style={{ justifyContent: 'flex-start', border: '1px solid hsl(var(--border))' }} onClick={() => setNotice('Calendar connection requires authorization. Use the Me tab to connect after authorizing.')}><Calendar size={16} /> Google Calendar</button><button className="button button-ghost" style={{ justifyContent: 'flex-start', border: '1px solid hsl(var(--border))' }} onClick={() => setNotice('Calendar connection requires authorization. Use the Me tab to connect after authorizing.')}><Calendar size={16} /> Microsoft Outlook</button></div>) : (<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: 'hsl(var(--secondary)/0.5)', borderRadius: 12 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} /><span style={{ fontSize: 13, fontWeight: 500 }}>{(() => {
  if (!calendarList || (calendarList as unknown[]).length === 0) return 'Calendar connected';
  const cList = calendarList as Array<{ id: string; provider: string }>;
  const visibleCount = cList.filter(c => state.preferences.calendarPrefs?.[c.id]?.visible !== false).length;
  const providers = Array.from(new Set(cList.map(c => c.provider === 'google' ? 'Google' : c.provider === 'outlook' ? 'Outlook' : c.provider)));
  return `${visibleCount} calendar${visibleCount !== 1 ? 's' : ''} · ${providers.join(' · ')}`;
})()}</span></div>)}</section><section className="soft-card" style={{ padding: 19 }}><div className="section-title"><h2>Today's capacity</h2><Gauge size={17} color="hsl(var(--primary))" /></div><div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.min(100, (state.tasks.filter((t) => t.done).length / Math.max(1, state.tasks.length)) * 100)}%` }} /></div><p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', lineHeight: 1.5, marginBottom: 0 }}>Leave a little margin. A plan is useful when life can still happen inside it.</p></section></aside></div>{modal.open && <TaskModal initial={modal.task} onClose={() => setModal({ open: false })} onSave={saveTask} />}</div>;
}

function Projects({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, update, setNotice } = app;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  if (!state) return null;
  return <div className="page-wrap"><PageHeader eyebrow="The bigger picture" title={<>Things worth <span className="serif">tending.</span></>} subtitle="Projects are containers, not obligations. Give each one a little shape." action={<button className="button button-primary" onClick={() => setAdding(true)} data-testid="button-add-project"><Plus size={16} /> New project</button>} /><button className="button button-primary mobile-only" style={{ marginBottom: 18 }} onClick={() => setAdding(true)} data-testid="button-add-project-mobile"><Plus size={16} /> New project</button>{adding && <div className="card" style={{ padding: 20, marginBottom: 20 }}><form style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: 10, alignItems: 'end' }} onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; update((s) => ({ ...s, projects: [{ id: `p${Date.now()}`, name: name.trim(), description: description || 'A project with room to grow.', color: '#a9cbbd', goal: 'Choose the next small step' }, ...s.projects] })); setName(''); setDescription(''); setAdding(false); setNotice('Project created.'); }}><div><label className="field-label" htmlFor="project-name">Project name</label><input autoFocus className="field" id="project-name" value={name} onChange={(event) => setName(event.target.value)} data-testid="input-project-name" /></div><div><label className="field-label" htmlFor="project-description">What is it for?</label><input className="field" id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} data-testid="input-project-description" /></div><div style={{ display: 'flex', gap: 6 }}><button className="button button-primary" type="submit" data-testid="button-save-project">Create</button><button type="button" className="button button-ghost" onClick={() => setAdding(false)} data-testid="button-cancel-project">Cancel</button></div></form></div>}<div className="project-grid">{state.projects.map((project) => { const related = state.tasks.filter((task) => task.project === project.name); const done = related.filter((task) => task.done).length; const progress = related.length ? Math.round((done / related.length) * 100) : 0; return <article className="card project-card" key={project.id} data-testid={`card-project-${project.id}`}><div className="project-card-head"><div className="project-icon" style={{ background: project.color }}><FolderKanban size={17} /></div><button className="icon-button" onClick={() => { update((s) => ({ ...s, projects: s.projects.filter((p) => p.id !== project.id) })); setNotice('Project archived.'); }} aria-label={`Archive ${project.name}`} data-testid={`button-archive-project-${project.id}`}><Archive size={15} /></button></div><h2>{project.name}</h2><p>{project.description}</p><div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%`, background: project.color }} /></div><div className="project-foot"><span>{progress}% in motion</span><span>{related.length ? `${done} of ${related.length} done` : 'No tasks yet'}</span></div><div className="divider" style={{ margin: '19px 0 13px' }} /><div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><TargetIcon /><span style={{ fontSize: 11, lineHeight: 1.4, color: 'hsl(var(--muted-foreground))' }}>{project.goal}</span></div></article>; })}</div>{state.projects.length === 0 && <div className="empty-state" style={{ marginTop: 20 }}><FolderKanban size={22} /><div>Your project shelf is clear.</div><button className="button button-primary" onClick={() => setAdding(true)} data-testid="button-create-first-project">Create a project</button></div>}</div>;
}

function TargetIcon() { return <div style={{ width: 20, height: 20, borderRadius: 7, background: 'hsl(var(--secondary))', color: 'hsl(var(--secondary-foreground))', display: 'grid', placeItems: 'center', flex: 'none' }}><CheckCircle2 size={12} /></div>; }

function assistantReply(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes('meeting') || lower.includes('call')) return "That sounds like a commitment with a shape. I would put it on the plan first, then decide what preparation is actually needed.";
  if (lower.includes('buy') || lower.includes('book') || lower.includes('email') || lower.includes('send')) return "This has a clear action inside it. I found the smallest useful version: name the thing, give it a home, and let the rest wait.";
  if (lower.includes('tired') || lower.includes('overwhelm') || lower.includes('too much')) return "You do not need to organize this feeling right now. Let\u2019s choose one low-lift action and leave the rest in the safe place.";
  return "I\u2019m holding onto this with you. It does not need to become a project before it becomes clearer.";
}
function breakdownText(text: string) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const pieces = cleaned.split(/[,.;]|\band then\b|\bafter that\b/i).map((piece) => piece.trim()).filter((piece) => piece.length > 3);
  return (pieces.length > 1 ? pieces : [`Clarify the next small step for: ${cleaned}`]).slice(0, 4);
}

function CapturePage({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, update, addCapture, addTask, logConnection, setNotice } = app;
  const [text, setText] = useState('');
  const [reply, setReply] = useState('');
  const [reconnectPersonId, setReconnectPersonId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [removedParts, setRemovedParts] = useState<string[]>([]);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const parts = useMemo(() => breakdownText(text).filter((part) => !removedParts.includes(part)), [text, removedParts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      textAreaRef.current?.focus();
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  if (!state) return null;

  const save = () => {
    if (!text.trim()) return;
    const cleaned = text.trim();
    const lower = cleaned.toLowerCase();
    const person = findPersonInText(cleaned, state.people);
    const isReminder = lower.includes('remind me');
    const soundsRecent = /\b(just|today|yesterday|talked|spoke|called|call|saw|met|connected)\b/.test(lower) && !/\b(haven't|have not|months|forever|long time)\b/.test(lower) && !isReminder;
    const soundsStale = /\b(haven't|have not|months|forever|long time)\b/.test(lower);
    addCapture(cleaned);
    setReconnectPersonId(null);
    if (lower.includes('who should i check in') || lower.includes('who should i reach out')) {
      const suggestions = state.people.filter((item) => isPersonReadyForGentlePrompt(item)).slice(0, 3);
      setReply(suggestions.length > 0 ? `A few gentle possibilities: ${suggestions.map((item) => item.name).join(', ')}. No pressure — just people who may feel good to reconnect with.` : 'Everyone is held for now. You can always tell me about someone new.');
    } else if (person && soundsRecent) {
      logConnection(person.id, cleaned, person.contactMethod);
      setReply(`I’ve noted that you connected with ${person.name}. That’s all handled.`);
    } else if (person && soundsStale) {
      setReconnectPersonId(person.id);
      setReply(`It sounds like ${person.name} has been on your mind. We can make the next step very small.`);
    } else if (person && lower.includes('when did i last')) {
      setReply(person.lastConnectedAt ? `Your last logged connection with ${person.name} was ${formatPersonDate(person.lastConnectedAt)}.` : `I don’t have a connection logged for ${person.name} yet.`);
    } else if (person && isReminder) {
      addTask({ title: `Connect with ${person.name}`, project: 'People & connections', due: 'Tomorrow', priority: 'low' });
      setReply(`I added a gentle reminder to your plan to connect with ${person.name}.`);
    } else {
      setReply(assistantReply(cleaned));
    }
    setRemovedParts([]);
    setNotice(person && soundsRecent ? `Connection with ${person.name} logged.` : 'Thought captured.');
  };
  const convert = () => { parts.forEach((part) => addTask({ title: part, project: 'Personal', due: 'Today', priority: 'medium' })); update((s) => ({ ...s, captures: s.captures.map((capture, index) => index === 0 ? { ...capture, converted: true } : capture) })); setNotice(`${parts.length} small steps added to your plan.`); };

  const toggleListen = () => {
    if (listening) {
      setListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice('Voice capture is not available in this browser.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    let baseText = text ? text + " " : "";
    
    recognition.onstart = () => setListening(true);
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results).map((r: any) => r[0].transcript).join('');
      setText(baseText + transcript);
      setReply('');
      setRemovedParts([]);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    
    try {
      recognition.start();
    } catch(e) {
      setListening(false);
    }
  };

  return <div className="page-wrap"><div className="capture-page"><PageHeader eyebrow="No sorting required" title={<>Say it before you <span className="serif">lose it.</span></>} subtitle="A private landing place for the thought circling your head." /><section className="card capture-box"><textarea ref={textAreaRef} className="capture-input" placeholder="What's taking up a little too much room in your mind?" value={text} onChange={(event) => { setText(event.target.value); setReply(''); setReconnectPersonId(null); setRemovedParts([]); }} aria-label="Brain dump" data-testid="textarea-brain-dump" /><div className="capture-footer"><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 14, flex: 1, padding: '20px 0' }}><button className={`voice-button-large ${listening ? 'listening' : ''}`} onClick={toggleListen} aria-label={listening ? 'Stop voice capture' : 'Start voice-style capture'} data-testid="button-voice-capture"><Mic size={32} /></button><span style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--muted-foreground))', marginTop: 16 }}>{listening ? "Listening…" : "Tap to speak"}</span></div></div><div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid hsl(var(--border))', paddingTop: 16, marginTop: 10 }}><button className="button button-primary" onClick={save} disabled={!text.trim()} data-testid="button-capture-thought"><Sparkles size={15} /> Make sense of this</button></div></section>{reply && <div className="assistant-note" data-testid="text-assistant-response"><div className="assistant-symbol"><Sparkles size={14} /></div><p>{reply}<br /><span style={{ display: 'block', marginTop: 6, color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>This is a small built-in reflection based on your words, not a connected external AI service.</span>{reconnectPersonId && <span className="assistant-actions"><button className="button button-secondary" onClick={() => { setText(`Draft a casual text to ${state.people.find((person) => person.id === reconnectPersonId)?.name ?? 'them'}`); setReply('A simple, warm note is usually enough. You can make it sound like you.'); }} data-testid="button-draft-reconnection">Draft a casual text</button><button className="button button-secondary" onClick={() => { const person = state.people.find((item) => item.id === reconnectPersonId); if (person) addTask({ title: `Call ${person.name}`, project: 'People & connections', due: 'Tomorrow', priority: 'low' }); setReply('I left a soft reminder for later.'); setNotice('Reminder added to your plan.'); }} data-testid="button-remind-reconnection">Remind me later</button><button className="button button-ghost" onClick={() => { setReconnectPersonId(null); setReply('Okay. I’ll leave it here without adding anything.'); }}>Not now</button></span>}</p></div>}{reply && parts.length > 0 && <section className="card breakdown">{parts.length > 1 ? <h2 style={{ fontSize: 16, marginBottom: 16 }}>Want me to turn this into a realistic plan?</h2> : <div className="section-title"><h2>Possible small steps</h2><span>Nothing is committed yet</span></div>}{parts.map((part, index) => <div className="breakdown-row" key={`${part}-${index}`}><span className="priority-dot" /><span style={{ flex: 1 }}>{part}</span><button className="icon-button" onClick={() => setRemovedParts((current) => [...current, part])} aria-label={`Remove suggested step ${index + 1}`} data-testid={`button-remove-breakdown-${index}`}><X size={14} /></button></div>)}<div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}><button className="button button-secondary" onClick={convert} data-testid="button-add-breakdown-to-plan"><ListChecks size={15} /> Add these to my plan</button></div></section>}<section style={{ marginTop: 35 }}><div className="section-title"><h2>Recent captures</h2><span>Only you can see these</span></div><div className="task-list">{state.captures.map((capture) => <div className="task-row" key={capture.id} data-testid={`row-capture-${capture.id}`}><div style={{ width: 22, height: 22, borderRadius: 7, background: 'hsl(var(--secondary))', display: 'grid', placeItems: 'center', color: 'hsl(var(--secondary-foreground))' }}><Brain size={13} /></div><div><div className="task-name" style={{ fontWeight: 500 }}>{capture.text}</div><div className="task-meta"><span>{capture.createdAt}</span>{capture.converted && <span className="task-tag">Added to plan</span>}</div></div><button className="icon-button" onClick={() => { update((s) => ({ ...s, captures: s.captures.filter((item) => item.id !== capture.id) })); setNotice('Capture deleted.'); }} aria-label="Delete capture" data-testid={`button-delete-capture-${capture.id}`}><Trash2 size={15} /></button></div>)}</div></section></div></div>;
}

function Me({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, update, reset, setNotice } = app;
  const { data: calendarList, isLoading: calListLoading } = useGetCalendarList();
  const { data: connectedAccounts, refetch: refetchAccounts } = useGetAuthAccounts();
  const { mutate: disconnectAccount, isPending: isDisconnecting } = useDeleteAuthAccountsId();
  const [justConnected, setJustConnected] = useState(false);
  const accents = [{ name: 'Clay', value: '#e88870' }, { name: 'Olive', value: '#9fbfae' }, { name: 'Ochre', value: '#c49b59' }, { name: 'Berry', value: '#b9798c' }, { name: 'Rose', value: '#c47d8a' }, { name: 'Slate', value: '#7b9eb5' }, { name: 'Dusk', value: '#9b8bbf' }];

  useEffect(() => {
    const hashQuery = window.location.hash.split('?')[1] ?? '';
    if (new URLSearchParams(hashQuery).get('connected') === '1') {
      setJustConnected(true);
      window.history.replaceState(null, '', '/#/me');
    }
  }, []);

  if (!state) return null;

  const ALL_SECTIONS = ['briefing', 'whatnow', 'priorities', 'timeline', 'capture', 'quote'];
  const activeSections = state.preferences.sectionOrder || ALL_SECTIONS;
  const inactiveSections = ALL_SECTIONS.filter(s => !activeSections.includes(s));
  const sectionLabels: Record<string, string> = { briefing: 'Morning Briefing', whatnow: 'What should I do right now?', priorities: 'Worth your attention', timeline: 'Your shape of today', capture: 'Capture box', quote: 'Daily Quote' };

  return <div className="page-wrap"><PageHeader eyebrow="The way it feels" title={<>Make it <span className="serif">yours.</span></>} subtitle="A few gentle controls for how My Day holds your life." /><div className="settings-grid"><div className="stack"><section className="card settings-card"><h2>Appearance</h2><p>Choose colors and fonts that feel right.</p><div className="setting-row"><div><strong>Color theme</strong><span>Light or dark mode</span></div><button className={`switch ${state.preferences.dark ? 'on' : ''}`} onClick={() => update((s) => ({ ...s, preferences: { ...s.preferences, dark: !s.preferences.dark } }))} aria-label="Toggle dark mode" data-testid="switch-dark-mode" /></div><div className="setting-row"><div><strong>App Font</strong><span>Personalize your reading experience</span></div><select className="field" style={{ width: 'auto', minWidth: 120, height: 44, padding: '0 12px' }} value={state.preferences.fontStyle || 'modern'} onChange={e => update(s => ({ ...s, preferences: { ...s.preferences, fontStyle: e.target.value as any } }))}><option value="modern">Modern (DM Sans)</option><option value="classic">Classic (Lora)</option><option value="rounded">Rounded (Nunito)</option></select></div><div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}><div><strong>Accent color</strong><span>Used for highlights and active states</span></div><div className="swatches" style={{ flexWrap: 'wrap' }} role="radiogroup" aria-label="Accent color">{accents.map((accent) => <button key={accent.value} className={`swatch ${state.preferences.accent === accent.value ? 'selected' : ''}`} style={{ background: accent.value }} onClick={() => { update((s) => ({ ...s, preferences: { ...s.preferences, accent: accent.value } })); setNotice(`${accent.name} is a good choice.`); }} aria-label={`Use ${accent.name} accent`} data-testid={`button-accent-${accent.name.toLowerCase()}`} />)}</div></div></section><section className="card settings-card"><h2>Calendars</h2><p>Manage visible calendars and colors.</p><div className="stack" style={{ gap: 0, marginTop: 12 }}>
    {calListLoading ? <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', padding: '10px 0' }}>Loading calendars…</div> : !calendarList || (calendarList as any[]).length === 0 ? <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', padding: '10px 0' }}>No calendars connected yet.</div> : (calendarList as Array<{ id: string; name: string; provider: string; color: string }>).map((cal) => {
      const isVisible = state.preferences.calendarPrefs?.[cal.id]?.visible !== false;
      const userColor = state.preferences.calendarPrefs?.[cal.id]?.color;
      const effectiveColor = userColor ?? cal.color ?? 'hsl(var(--primary))';
      return (
        <div key={cal.id} style={{ padding: '12px 0', borderBottom: '1px solid hsl(var(--border))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: effectiveColor }} />
              <div>
                <strong style={{ fontSize: 14, display: 'block' }}>{cal.name}</strong>
                <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', textTransform: 'capitalize' }}>{cal.provider === 'google' ? 'Google' : cal.provider === 'outlook' ? 'Outlook' : cal.provider}</span>
              </div>
            </div>
            <button className={`switch ${isVisible ? 'on' : ''}`} onClick={() => update(s => ({ ...s, preferences: { ...s.preferences, calendarPrefs: { ...s.preferences.calendarPrefs, [cal.id]: { visible: !isVisible, color: s.preferences.calendarPrefs?.[cal.id]?.color ?? null } } } }))} />
          </div>
          {isVisible && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {['#e88870', '#a9cbbd', '#d9ba83', '#b7afb9', '#8eafc2', '#c48bb8', '#e8a87c'].map(swatch => (
                <button key={swatch} className={`swatch ${userColor === swatch ? 'selected' : ''}`} style={{ background: swatch, width: 20, height: 20 }} onClick={() => update(s => ({ ...s, preferences: { ...s.preferences, calendarPrefs: { ...s.preferences.calendarPrefs, [cal.id]: { visible: isVisible, color: swatch } } } }))} />
              ))}
              {userColor && <button className="button button-ghost" style={{ fontSize: 11, minHeight: 20, padding: '0 6px' }} onClick={() => update(s => ({ ...s, preferences: { ...s.preferences, calendarPrefs: { ...s.preferences.calendarPrefs, [cal.id]: { visible: isVisible, color: null } } } }))}>Reset</button>}
            </div>
          )}
        </div>
      );
    })}
    {!calListLoading && (!calendarList || !(calendarList as any[]).some(c => c.provider === 'outlook')) && (
      <button className="button button-ghost" style={{ justifyContent: 'flex-start', border: '1px solid hsl(var(--border))', width: '100%', marginTop: 16 }} onClick={() => setNotice('To connect Outlook, ask your assistant to add it from the integrations panel.')}><Calendar size={16} /> Connect Outlook calendar</button>
    )}
  </div></section><section className="card settings-card"><h2>Customize Today</h2><p>Reorder or hide sections on your Today view.</p><div className="stack" style={{ gap: 0, marginTop: 12 }}>{activeSections.map((s, idx) => (<div key={s} className="setting-row" style={{ padding: '10px 0', borderBottom: '1px solid hsl(var(--border))', borderTop: 'none' }}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><button className="icon-button" style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }} onClick={() => { update(st => ({ ...st, preferences: { ...st.preferences, sectionOrder: st.preferences.sectionOrder.filter(x => x !== s) }})); }}><Check size={16} color="hsl(var(--primary))" /></button><strong style={{ fontSize: 13 }}>{sectionLabels[s] || s}</strong></div><div style={{ display: 'flex', gap: 4 }}><button className="icon-button" style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }} disabled={idx === 0} onClick={() => { const arr = [...state.preferences.sectionOrder]; [arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]]; update(st => ({ ...st, preferences: { ...st.preferences, sectionOrder: arr }})); }}><ChevronUp size={16} /></button><button className="icon-button" style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }} disabled={idx === activeSections.length - 1} onClick={() => { const arr = [...state.preferences.sectionOrder]; [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]; update(st => ({ ...st, preferences: { ...st.preferences, sectionOrder: arr }})); }}><ChevronDown size={16} /></button></div></div>))}{inactiveSections.map(s => (<div key={s} className="setting-row" style={{ padding: '10px 0', borderBottom: '1px solid hsl(var(--border))', borderTop: 'none', opacity: 0.6 }}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><button className="icon-button" style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }} onClick={() => { update(st => ({ ...st, preferences: { ...st.preferences, sectionOrder: [...st.preferences.sectionOrder, s] }})); }}><Plus size={16} /></button><strong style={{ fontSize: 13 }}>{sectionLabels[s] || s}</strong></div></div>))}</div></section></div><div className="stack"><section className="card settings-card"><h2>Google Accounts</h2><p>Connect one or more Google accounts to see all your calendars together.</p>{justConnected && <div className="soft-card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'hsl(var(--primary)/0.1)', borderColor: 'hsl(var(--primary)/0.25)' }}><CheckCircle2 size={16} color="hsl(var(--primary))" /><span style={{ fontSize: 13 }}>Google account connected successfully.</span></div>}<div className="stack" style={{ gap: 0, marginTop: 12 }}>{(connectedAccounts ?? []).length === 0 ? <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', padding: '10px 0' }}>No Google accounts connected yet.</div> : (connectedAccounts ?? []).map(account => (<div key={account.id} className="setting-row" style={{ padding: '10px 0', borderBottom: '1px solid hsl(var(--border))' }}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4285f4', display: 'grid', placeItems: 'center' }}><Mail size={13} color="#fff" /></div><span style={{ fontSize: 13 }}>{account.email}</span></div><button className="button button-ghost" style={{ fontSize: 12, minHeight: 32, padding: '0 10px', color: 'hsl(var(--muted-foreground))' }} disabled={isDisconnecting} onClick={() => disconnectAccount({ id: account.id }, { onSuccess: () => { void refetchAccounts(); setNotice('Account disconnected.'); } })}>Disconnect</button></div>))}</div><a className="button button-secondary" style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }} href="/api/auth/google/start"><Plus size={15} /> Add Google Account</a></section><section className="card settings-card"><h2>Your privacy</h2><p>My Day is designed to feel personal without being mysterious.</p><div className="soft-card" style={{ padding: 15, display: 'flex', gap: 11, alignItems: 'flex-start' }}><ShieldCheck size={18} color="hsl(var(--primary))" /><div><strong style={{ fontSize: 12 }}>Saved to the cloud, tied to this browser</strong><p style={{ margin: '4px 0 0', fontSize: 11, lineHeight: 1.5 }}>Your tasks, captures, and preferences are stored in a private database and survive page refreshes and browser restarts. They are linked to a cookie in this browser — clearing cookies or using a different device will start fresh with sample data.</p></div></div><div className="setting-row"><div><strong>Clear all day data</strong><span>Return to the welcoming sample day.</span></div><button className="button button-danger" onClick={reset} data-testid="button-reset-data"><RotateCcw size={14} /> Reset</button></div></section><section className="soft-card" style={{ padding: 20 }}><div style={{ display: 'flex', gap: 11 }}><Keyboard size={17} color="hsl(var(--primary))" /><div><strong style={{ fontSize: 12 }}>A few useful keys</strong><p style={{ margin: '7px 0 0', color: 'hsl(var(--muted-foreground))', fontSize: 11, lineHeight: 1.65 }}>Use Command + Enter to save a quick capture. Your attention is the main interface.</p></div></div></section></div></div></div>;
}

function DuplicateSurface({ app }: { app: ReturnType<typeof useAppState> }) {
  const [location] = useLocation();
  const [reviewOpen, setReviewOpen] = useState(false);
  const { state, update, removeTask, setNotice } = app;
  const { data: calendarEvents } = useGetCalendarEvents({ date: localDateKey(new Date()) });

  if (location !== '/plan' || !state) return null;

  const events = (calendarEvents ?? []) as Array<{ id: string; title: string; start: string; allDay: boolean }>;
  const pairs = findDuplicatePairs(state.tasks, events).filter((pair) => !(state.preferences.dismissedDuplicates ?? []).includes(pair.id));
  const dismiss = (id: string) => update((current) => ({ ...current, preferences: { ...current.preferences, dismissedDuplicates: Array.from(new Set([...(current.preferences.dismissedDuplicates ?? []), id])) } }));
  const remove = (pair: DuplicatePair) => {
    if (!pair.removeTaskId) return;
    removeTask(pair.removeTaskId);
    dismiss(pair.id);
    setNotice(`${pair.removeTaskTitle || 'Task'} removed.`);
  };

  return <>{pairs.length > 0 && <button className="duplicate-banner" onClick={() => setReviewOpen(true)} data-testid="button-review-duplicates"><div className="duplicate-banner-icon"><HeartHandshake size={16} /></div><span><strong>We noticed a couple of things that might overlap.</strong><small>Want to tidy them up?</small></span><ArrowRight size={16} /></button>}{reviewOpen && pairs.length > 0 && <DuplicateReviewModal pairs={pairs} onClose={() => setReviewOpen(false)} onKeepBoth={dismiss} onRemoveTask={remove} />}</>;
}

function NotFoundView() { return <div className="page-wrap"><div className="empty-state" style={{ marginTop: '15vh' }}><Compass size={25} /><h1 className="page-title" style={{ fontSize: 35 }}>A quiet dead end.</h1><p>That page is not part of today.</p><Link className="button button-primary" href="/" data-testid="link-back-home">Back to today</Link></div></div>; }

function Router({ app }: { app: ReturnType<typeof useAppState> }) {
  return <Shell><ErrorBoundary resetKey={window.location.pathname}><Switch><Route path="/" component={() => <Home app={app} />} /><Route path="/plan" component={() => <Plan app={app} />} /><Route path="/people" component={() => <People app={app} />} /><Route path="/projects" component={() => <Projects app={app} />} /><Route path="/capture" component={() => <CapturePage app={app} />} /><Route path="/me" component={() => <Me app={app} />} /><Route component={NotFoundView} /></Switch></ErrorBoundary></Shell>;
}

/** Inner app — runs inside QueryClientProvider so hooks work */
function AppInner() {
  const app = useAppState();

  if (app.isLoading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <Logo />
        <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>Setting up your day…</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router app={app} />
        <DuplicateSurface app={app} />
      </WouterRouter>
      <Toaster />
      {app.notice && <div className="toast-note" role="status" data-testid="status-toast">{app.notice}</div>}
    </TooltipProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}

export default App;
