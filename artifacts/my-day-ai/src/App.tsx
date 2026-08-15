import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Archive, ArrowLeft, ArrowRight, Bell, Brain, Calendar, CalendarClock, Check,
  CheckCircle2, ChevronDown, CircleHelp, ClipboardList, Clock3, Command, Compass,
  Download, FolderKanban, Gauge, Headphones, Home as HomeIcon, Keyboard, Lightbulb, ListChecks,
  Menu, Mic, MoreHorizontal, Moon, Plus, RotateCcw, Search, Settings2, ShieldCheck,
  Sparkles, Sun, Trash2, UserRound, Volume2, WandSparkles, X
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const STORAGE_KEY = 'my-day-ai-state-v1';

type Task = {
  id: string;
  title: string;
  project: string;
  due: string;
  time?: string;
  priority: 'high' | 'medium' | 'low';
  done: boolean;
};
type Project = { id: string; name: string; description: string; color: string; goal: string };
type Capture = { id: string; text: string; createdAt: string; converted: boolean };
type Preferences = { dark: boolean; accent: string; memory: boolean; reminders: boolean };
type AppState = { tasks: Task[]; projects: Project[]; captures: Capture[]; preferences: Preferences };

const seedState: AppState = {
  tasks: [
    { id: 't1', title: 'Send the revised proposal to Maya', project: 'Work rhythm', due: 'Today', time: '09:30', priority: 'high', done: false },
    { id: 't2', title: 'Book a quiet place for Friday', project: 'Personal', due: 'Today', time: '11:00', priority: 'medium', done: false },
    { id: 't3', title: 'Review the first three portfolio notes', project: 'Portfolio refresh', due: 'Today', time: '14:00', priority: 'medium', done: false },
    { id: 't4', title: 'Walk around the block before dinner', project: 'Personal', due: 'Today', time: '18:30', priority: 'low', done: false },
    { id: 't5', title: 'Outline next week’s priorities', project: 'Work rhythm', due: 'Tomorrow', priority: 'low', done: false },
    { id: 't6', title: 'Choose two photos for the case study', project: 'Portfolio refresh', due: 'Friday', priority: 'medium', done: true },
  ],
  projects: [
    { id: 'p1', name: 'Work rhythm', description: 'A clearer week with fewer loose ends.', color: '#e88870', goal: 'Protect two deep-work mornings' },
    { id: 'p2', name: 'Portfolio refresh', description: 'A small, honest collection of recent work.', color: '#a9cbbd', goal: 'Publish the first draft' },
    { id: 'p3', name: 'Home, gently', description: 'Make the apartment feel easy to return to.', color: '#d9ba83', goal: 'Finish the Sunday reset' },
    { id: 'p4', name: 'Personal', description: 'The little things that keep the week kind.', color: '#b7afb9', goal: 'Leave room for real life' },
  ],
  captures: [
    { id: 'c1', text: 'Remember to ask Jo about the intro when I send the proposal.', createdAt: 'Today, 08:42', converted: false },
    { id: 'c2', text: 'I want to make more space for reading without making it another project.', createdAt: 'Yesterday, 20:16', converted: true },
  ],
  preferences: { dark: false, accent: '#e88870', memory: true, reminders: true },
};

function readState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as AppState;
  } catch { /* use the welcoming seed when storage is unavailable */ }
  return seedState;
}

function useAppState() {
  const [state, setState] = useState<AppState>(readState);
  const [notice, setNotice] = useState('');
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.preferences.dark);
    document.documentElement.style.setProperty('--primary', hexToHsl(state.preferences.accent));
  }, [state.preferences]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const update = (fn: (current: AppState) => AppState) => setState((current) => fn(current));
  const toggleTask = (id: string) => update((s) => ({ ...s, tasks: s.tasks.map((t) => t.id === id ? { ...t, done: !t.done } : t) }));
  const removeTask = (id: string) => update((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
  const addTask = (task: Omit<Task, 'id' | 'done'>) => update((s) => ({ ...s, tasks: [{ ...task, id: `t${Date.now()}`, done: false }, ...s.tasks] }));
  const editTask = (id: string, patch: Partial<Task>) => update((s) => ({ ...s, tasks: s.tasks.map((t) => t.id === id ? { ...t, ...patch } : t) }));
  const addCapture = (text: string) => update((s) => ({ ...s, captures: [{ id: `c${Date.now()}`, text, createdAt: 'Just now', converted: false }, ...s.captures] }));
  const reset = () => { setState(seedState); setNotice('Your sample day is back.'); };
  return { state, update, toggleTask, removeTask, addTask, editTask, addCapture, reset, notice, setNotice };
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

function Logo() {
  return <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div className="brand-mark">m</div><span className="brand-word">my day<span style={{ color: 'hsl(var(--primary))' }}>.</span></span></div>;
}

function navItems() {
  return [
    { href: '/', label: 'Today', icon: HomeIcon },
    { href: '/plan', label: 'Plan', icon: Calendar },
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
        <div className="mini-profile"><div className="avatar">AR</div><div><strong style={{ display: 'block', fontSize: 12 }}>Alex Rivera</strong><span style={{ color: 'hsl(var(--sidebar-foreground) / .5)', fontSize: 10 }}>A quieter way forward</span></div></div>
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

function TaskRow({ task, onToggle, onDelete, onEdit, onReschedule }: { task: Task; onToggle: () => void; onDelete?: () => void; onEdit?: () => void; onReschedule?: () => void }) {
  return <div className={`task-row ${task.done ? 'done' : ''}`} data-testid={`row-task-${task.id}`}>
    <input className="check" type="checkbox" checked={task.done} onChange={onToggle} aria-label={`${task.done ? 'Reopen' : 'Complete'} ${task.title}`} data-testid={`checkbox-task-${task.id}`} />
    <div><div className="task-name">{task.title}</div><div className="task-meta"><span className={`priority-dot ${task.priority}`} /><span>{task.time || task.due}</span><span>·</span><span>{task.project}</span></div></div>
    <div className="task-actions" style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {onReschedule && <button className="icon-button" onClick={onReschedule} aria-label={`Reschedule ${task.title}`} data-testid={`button-reschedule-${task.id}`}><CalendarClock size={15} /></button>}
      {onEdit && <button className="icon-button" onClick={onEdit} aria-label={`Edit ${task.title}`} data-testid={`button-edit-${task.id}`}><MoreHorizontal size={16} /></button>}
      {onDelete && <button className="icon-button" onClick={onDelete} aria-label={`Delete ${task.title}`} data-testid={`button-delete-${task.id}`}><Trash2 size={15} /></button>}
    </div>
  </div>;
}

function Home({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, toggleTask, removeTask, update, setNotice } = app;
  const [overwhelmed, setOverwhelmed] = useState(false);
  const [captureText, setCaptureText] = useState('');
  const remaining = state.tasks.filter((task) => !task.done && task.due === 'Today');
  const next = remaining[0];
  const completed = state.tasks.filter((task) => task.done).length;
  const submitCapture = () => {
    if (!captureText.trim()) return;
    app.addCapture(captureText.trim());
    setCaptureText('');
    setNotice('Held onto that thought.');
  };
  if (overwhelmed) return <div className="page-wrap"><PageHeader eyebrow="A softer view" title={<>One thing, <span className="serif">for now.</span></>} subtitle="The rest can wait. You do not need to solve the whole day at once." action={<button className="button button-secondary" onClick={() => setOverwhelmed(false)} data-testid="button-return-normal"><ArrowLeft size={15} /> Return to my day</button>} /><div className="card overwhelm-card" style={{ maxWidth: 650, minHeight: 360, margin: '10vh auto 0' }}><div><div className="eyebrow">Your next gentle step</div><h2>{next ? next.title : 'The day is already held.'}</h2><p>{next ? 'Give this one small thing your attention. Everything else is allowed to be background noise.' : 'You have moved through today’s list. A pause is a perfectly good next step.'}</p></div><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{next && <button className="button button-primary" onClick={() => { toggleTask(next.id); setNotice('That is enough for now.'); }} data-testid="button-complete-next"><Check size={15} /> Mark it complete</button>}<button className="button" style={{ background: 'hsl(var(--sidebar-foreground) / .12)', color: 'inherit' }} onClick={() => setOverwhelmed(false)} data-testid="button-see-day">See my full day</button></div></div></div>;
  return <div className="page-wrap">
    <PageHeader eyebrow="Thursday, 24 October" title={<>Good morning, <span className="serif">Alex.</span></>} subtitle={`${remaining.length} things worth your attention today. We can make room for them.`} action={<button className="button button-secondary" onClick={() => setOverwhelmed(true)} data-testid="button-overwhelmed"><CircleHelp size={15} /> I’m overwhelmed</button>} />
    <div className="grid-home">
      <div className="stack">
        <section className="card briefing" data-testid="card-ai-briefing"><div className="briefing-top"><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="status-dot" /><span className="eyebrow" style={{ color: 'hsl(var(--muted-foreground))' }}>Your morning briefing</span></div><Sparkles size={18} color="hsl(var(--primary))" /></div><h2>You have a clear first move, and a little room after it.</h2><p>Start with Maya’s proposal while your thinking is fresh. The booking can follow. I’ve kept the afternoon lighter so the portfolio work does not become another mountain.</p><div className="briefing-actions"><Link href="/plan" className="button button-primary" data-testid="link-open-plan"><Calendar size={15} /> Open today’s plan</Link><Link href="/capture" className="button button-ghost" data-testid="link-open-capture"><Plus size={15} /> Add a thought</Link></div></section>
        <section><div className="section-title"><h2>Worth your attention</h2><span>{completed} complete</span></div><div className="task-list">{remaining.slice(0, 3).map((task) => <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task.id)} onDelete={() => { removeTask(task.id); setNotice('Task removed.'); }} onReschedule={() => { update((s) => ({ ...s, tasks: s.tasks.map((t) => t.id === task.id ? { ...t, due: 'Tomorrow', time: undefined } : t) })); setNotice('Moved to tomorrow.'); }} />)}{remaining.length === 0 && <div className="empty-state"><CheckCircle2 size={23} /><div>Today is clear enough. Notice how that feels.</div><Link href="/plan" className="button button-secondary" style={{ marginTop: 15 }} data-testid="link-review-completed">Review the plan</Link></div>}</div></section>
        <section className="card capture-box"><div className="section-title"><h2>Put it somewhere safe</h2><span>Nothing gets lost here</span></div><textarea className="capture-input" placeholder="A thought, a worry, a thing to remember…" value={captureText} onChange={(event) => setCaptureText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submitCapture(); }} aria-label="Quick capture" data-testid="textarea-quick-capture" /><div className="capture-footer"><span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 10 }}><Command size={12} style={{ verticalAlign: 'middle' }} /> + Enter to save</span><button className="button button-primary" onClick={submitCapture} disabled={!captureText.trim()} data-testid="button-save-capture">Hold onto it <ArrowRight size={14} /></button></div></section>
      </div>
      <div className="stack">
        <section className="card overwhelm-card"><div><div className="eyebrow">When the list feels loud</div><h2>Let’s make it smaller.</h2><p>There is no prize for carrying every open loop at the same time.</p><div className="next-step"><span>Try this next</span><strong>{next?.title || 'Take a real pause'}</strong></div></div><button className="button" style={{ background: 'hsl(var(--sidebar-foreground) / .12)', color: 'inherit', width: 'fit-content' }} onClick={() => setOverwhelmed(true)} data-testid="button-simplify-day"><WandSparkles size={15} /> Simplify my day</button></section>
        <section className="card timeline"><div className="section-title"><h2>Your shape of today</h2><span>Local time</span></div><div>{[['09:30', 'Send the revised proposal', 'Work rhythm'], ['11:00', 'Book a quiet place', 'Personal'], ['14:00', 'Portfolio notes', 'Portfolio refresh'], ['18:30', 'A walk before dinner', 'Personal']].map(([time, title, project], index) => <div className="timeline-item" key={title}><div className="timeline-time">{time}</div><div className="timeline-track"><span className="timeline-node" /><span className="timeline-line" /></div><div className="timeline-copy"><strong>{title}</strong><p>{project}</p></div></div>)}</div></section>
        <section className="soft-card" style={{ padding: 19 }}><div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}><Lightbulb size={17} color="hsl(var(--primary))" /><div><strong style={{ fontSize: 12 }}>A small observation</strong><p style={{ fontSize: 11, lineHeight: 1.55, color: 'hsl(var(--muted-foreground))', margin: '6px 0 0' }}>Your best work is already protected at 9:30. Everything after that is allowed to be smaller.</p></div></div></section>
      </div>
    </div>
  </div>;
}

function TaskModal({ initial, onClose, onSave }: { initial?: Task; onClose: () => void; onSave: (task: Omit<Task, 'id' | 'done'>) => void }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [project, setProject] = useState(initial?.project || 'Personal');
  const [due, setDue] = useState(initial?.due || 'Today');
  const [time, setTime] = useState(initial?.time || '');
  const [priority, setPriority] = useState<Task['priority']>(initial?.priority || 'medium');
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title"><div className="modal-head"><h2 id="task-modal-title">{initial ? 'Shape this task' : 'Add a task'}</h2><button className="icon-button" onClick={onClose} aria-label="Close task form" data-testid="button-close-task-form"><X size={18} /></button></div><form className="form-stack" onSubmit={(event) => { event.preventDefault(); if (title.trim()) onSave({ title: title.trim(), project, due, time: time || undefined, priority }); }}><div><label className="field-label" htmlFor="task-title">What needs doing?</label><input id="task-title" autoFocus className="field" value={title} onChange={(event) => setTitle(event.target.value)} data-testid="input-task-title" /></div><div><label className="field-label" htmlFor="task-project">Area</label><input id="task-project" className="field" value={project} onChange={(event) => setProject(event.target.value)} data-testid="input-task-project" /></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><div><label className="field-label" htmlFor="task-due">When</label><select id="task-due" className="field" value={due} onChange={(event) => setDue(event.target.value)} data-testid="select-task-due"><option>Today</option><option>Tomorrow</option><option>Friday</option><option>Someday</option></select></div><div><label className="field-label" htmlFor="task-time">Time <span style={{ fontWeight: 400 }}>(optional)</span></label><input id="task-time" type="time" className="field" value={time} onChange={(event) => setTime(event.target.value)} data-testid="input-task-time" /></div></div><div><label className="field-label" htmlFor="task-priority">Energy required</label><select id="task-priority" className="field" value={priority} onChange={(event) => setPriority(event.target.value as Task['priority'])} data-testid="select-task-priority"><option value="high">High focus</option><option value="medium">Some focus</option><option value="low">Low lift</option></select></div><div className="form-actions"><button type="button" className="button button-ghost" onClick={onClose} data-testid="button-cancel-task">Cancel</button><button className="button button-primary" type="submit" data-testid="button-save-task">{initial ? 'Save changes' : 'Add to plan'}</button></div></form></div></div>;
}

function Plan({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, toggleTask, removeTask, addTask, editTask, setNotice, update } = app;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [modal, setModal] = useState<{ open: boolean; task?: Task }>({ open: false });
  const visible = state.tasks.filter((task) => (filter === 'All' || task.due === filter || (filter === 'Open' && !task.done) || (filter === 'Done' && task.done)) && task.title.toLowerCase().includes(query.toLowerCase()));
  const saveTask = (data: Omit<Task, 'id' | 'done'>) => {
    if (modal.task) editTask(modal.task.id, data); else addTask(data);
    setModal({ open: false }); setNotice(modal.task ? 'Task updated.' : 'Added to your plan.');
  };
  return <div className="page-wrap"><PageHeader eyebrow="The week, in view" title={<>Make a plan that <span className="serif">breathes.</span></>} subtitle="A flexible shape for the things you want to move forward." action={<button className="button button-primary" onClick={() => setModal({ open: true })} data-testid="button-add-task"><Plus size={16} /> Add task</button>} /><div className="plan-toolbar"><div className="search-field"><Search size={15} /><input className="field" type="search" placeholder="Find a task…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search tasks" data-testid="input-search-tasks" /></div><select className="field select-field" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter tasks" data-testid="select-filter-tasks"><option>All</option><option>Open</option><option>Done</option><option>Today</option><option>Tomorrow</option></select><button className="button button-secondary" onClick={() => setModal({ open: true })} data-testid="button-add-task-toolbar"><Plus size={15} /> New task</button></div><div className="plan-grid"><section><div className="section-title"><h2>{filter === 'All' ? 'All open loops' : `${filter} tasks`}</h2><span>{visible.length} {visible.length === 1 ? 'task' : 'tasks'}</span></div><div className="task-list">{visible.map((task) => <TaskRow key={task.id} task={task} onToggle={() => { toggleTask(task.id); setNotice(task.done ? 'Back on the list.' : 'Nice. One less thing to carry.'); }} onDelete={() => { removeTask(task.id); setNotice('Task removed.'); }} onEdit={() => setModal({ open: true, task })} onReschedule={() => { update((s) => ({ ...s, tasks: s.tasks.map((t) => t.id === task.id ? { ...t, due: t.due === 'Today' ? 'Tomorrow' : 'Today' } : t) })); setNotice(task.due === 'Today' ? 'Moved to tomorrow.' : 'Brought back to today.'); }} />)}{visible.length === 0 && <div className="empty-state"><Search size={22} /><div>No tasks match that view.</div><button className="button button-ghost" onClick={() => { setQuery(''); setFilter('All'); }} data-testid="button-clear-task-filter">Clear filters</button></div>}</div></section><aside className="stack"><section className="card calendar-card"><div className="calendar-head"><button className="icon-button" onClick={() => setNotice('The previous week is tucked away for now.')} aria-label="Previous week" data-testid="button-previous-week"><ArrowLeft size={16} /></button><strong>October 2024</strong><button className="icon-button" onClick={() => setNotice('The next week can wait until this one is shaped.')} aria-label="Next week" data-testid="button-next-week"><ArrowRight size={16} /></button></div><div className="week-grid">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <div className={`day-cell ${index === 3 ? 'today' : ''}`} key={`${day}-${index}`}><span>{day}</span><b>{21 + index}</b></div>)}</div><div className="calendar-event"><strong>Deep work morning</strong><span>Today · 09:00 — 11:00</span></div><div className="calendar-event" style={{ borderLeftColor: 'hsl(var(--accent-foreground))' }}><strong>Leave the afternoon open</strong><span>Today · 15:30 onward</span></div></section><section className="soft-card" style={{ padding: 19 }}><div className="section-title"><h2>Today’s capacity</h2><Gauge size={17} color="hsl(var(--primary))" /></div><div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.min(100, (state.tasks.filter((t) => t.done).length / Math.max(1, state.tasks.length)) * 100)}%` }} /></div><p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', lineHeight: 1.5, marginBottom: 0 }}>Leave a little margin. A plan is useful when life can still happen inside it.</p></section></aside></div>{modal.open && <TaskModal initial={modal.task} onClose={() => setModal({ open: false })} onSave={saveTask} />}</div>;
}

function Projects({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, update, setNotice } = app;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return <div className="page-wrap"><PageHeader eyebrow="The bigger picture" title={<>Things worth <span className="serif">tending.</span></>} subtitle="Projects are containers, not obligations. Give each one a little shape." action={<button className="button button-primary" onClick={() => setAdding(true)} data-testid="button-add-project"><Plus size={16} /> New project</button>} /><button className="button button-primary mobile-only" style={{ marginBottom: 18 }} onClick={() => setAdding(true)} data-testid="button-add-project-mobile"><Plus size={16} /> New project</button>{adding && <div className="card" style={{ padding: 20, marginBottom: 20 }}><form style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: 10, alignItems: 'end' }} onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; update((s) => ({ ...s, projects: [{ id: `p${Date.now()}`, name: name.trim(), description: description || 'A project with room to grow.', color: '#a9cbbd', goal: 'Choose the next small step' }, ...s.projects] })); setName(''); setDescription(''); setAdding(false); setNotice('Project created.'); }}><div><label className="field-label" htmlFor="project-name">Project name</label><input autoFocus className="field" id="project-name" value={name} onChange={(event) => setName(event.target.value)} data-testid="input-project-name" /></div><div><label className="field-label" htmlFor="project-description">What is it for?</label><input className="field" id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} data-testid="input-project-description" /></div><div style={{ display: 'flex', gap: 6 }}><button className="button button-primary" type="submit" data-testid="button-save-project">Create</button><button type="button" className="button button-ghost" onClick={() => setAdding(false)} data-testid="button-cancel-project">Cancel</button></div></form></div>}<div className="project-grid">{state.projects.map((project) => { const related = state.tasks.filter((task) => task.project === project.name); const done = related.filter((task) => task.done).length; const progress = related.length ? Math.round((done / related.length) * 100) : 0; return <article className="card project-card" key={project.id} data-testid={`card-project-${project.id}`}><div className="project-card-head"><div className="project-icon" style={{ background: project.color }}><FolderKanban size={17} /></div><button className="icon-button" onClick={() => { update((s) => ({ ...s, projects: s.projects.filter((p) => p.id !== project.id) })); setNotice('Project archived.'); }} aria-label={`Archive ${project.name}`} data-testid={`button-archive-project-${project.id}`}><Archive size={15} /></button></div><h2>{project.name}</h2><p>{project.description}</p><div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%`, background: project.color }} /></div><div className="project-foot"><span>{progress}% in motion</span><span>{related.length ? `${done} of ${related.length} done` : 'No tasks yet'}</span></div><div className="divider" style={{ margin: '19px 0 13px' }} /><div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><TargetIcon /><span style={{ fontSize: 11, lineHeight: 1.4, color: 'hsl(var(--muted-foreground))' }}>{project.goal}</span></div></article>; })}</div>{state.projects.length === 0 && <div className="empty-state" style={{ marginTop: 20 }}><FolderKanban size={22} /><div>Your project shelf is clear.</div><button className="button button-primary" onClick={() => setAdding(true)} data-testid="button-create-first-project">Create a project</button></div>}</div>;
}

function TargetIcon() { return <div style={{ width: 20, height: 20, borderRadius: 7, background: 'hsl(var(--secondary))', color: 'hsl(var(--secondary-foreground))', display: 'grid', placeItems: 'center', flex: 'none' }}><CheckCircle2 size={12} /></div>; }

function assistantReply(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes('meeting') || lower.includes('call')) return 'That sounds like a commitment with a shape. I would put it on the plan first, then decide what preparation is actually needed.';
  if (lower.includes('buy') || lower.includes('book') || lower.includes('email') || lower.includes('send')) return 'This has a clear action inside it. I found the smallest useful version: name the thing, give it a home, and let the rest wait.';
  if (lower.includes('tired') || lower.includes('overwhelm') || lower.includes('too much')) return 'You do not need to organize this feeling right now. Let’s choose one low-lift action and leave the rest in the safe place.';
  return 'I’m holding onto this with you. It does not need to become a project before it becomes clearer.';
}
function breakdownText(text: string) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const pieces = cleaned.split(/[,.;]|\band then\b|\bafter that\b/i).map((piece) => piece.trim()).filter((piece) => piece.length > 3);
  return (pieces.length > 1 ? pieces : [`Clarify the next small step for: ${cleaned}`]).slice(0, 4);
}

function CapturePage({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, update, addCapture, addTask, setNotice } = app;
  const [text, setText] = useState('');
  const [reply, setReply] = useState('');
  const [listening, setListening] = useState(false);
  const [removedParts, setRemovedParts] = useState<string[]>([]);
  const parts = useMemo(() => breakdownText(text).filter((part) => !removedParts.includes(part)), [text, removedParts]);
  const save = () => { if (!text.trim()) return; addCapture(text.trim()); setReply(assistantReply(text)); setRemovedParts([]); setNotice('Thought captured.'); };
  const convert = () => { parts.forEach((part) => addTask({ title: part, project: 'Personal', due: 'Today', priority: 'medium' })); update((s) => ({ ...s, captures: s.captures.map((capture, index) => index === 0 ? { ...capture, converted: true } : capture) })); setNotice(`${parts.length} small steps added to your plan.`); };
  return <div className="page-wrap"><div className="capture-page"><PageHeader eyebrow="No sorting required" title={<>Say it before you <span className="serif">lose it.</span></>} subtitle="A private landing place for the thought circling your head." /><section className="card capture-box"><textarea className="capture-input" autoFocus placeholder="What’s taking up a little too much room in your mind?" value={text} onChange={(event) => { setText(event.target.value); setReply(''); setRemovedParts([]); }} aria-label="Brain dump" data-testid="textarea-brain-dump" /><div className="capture-footer"><button className={`voice-button ${listening ? 'listening' : ''}`} onClick={() => { setListening(!listening); setNotice(listening ? 'Voice capture paused.' : 'Voice capture is a visual affordance for now.'); }} aria-label={listening ? 'Stop voice capture' : 'Start voice-style capture'} data-testid="button-voice-capture">{listening ? <Volume2 size={16} /> : <Mic size={16} />}</button><button className="button button-primary" onClick={save} disabled={!text.trim()} data-testid="button-capture-thought"><Sparkles size={15} /> Make sense of this</button></div></section>{reply && <div className="assistant-note" data-testid="text-assistant-response"><div className="assistant-symbol"><Sparkles size={14} /></div><p>{reply}<br /><span style={{ display: 'block', marginTop: 6, color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>This is a small built-in reflection based on your words, not a connected external AI service.</span></p></div>}{reply && parts.length > 0 && <section className="card breakdown"><div className="section-title"><h2>Possible small steps</h2><span>Nothing is committed yet</span></div>{parts.map((part, index) => <div className="breakdown-row" key={`${part}-${index}`}><span className="priority-dot" /><span style={{ flex: 1 }}>{part}</span><button className="icon-button" onClick={() => setRemovedParts((current) => [...current, part])} aria-label={`Remove suggested step ${index + 1}`} data-testid={`button-remove-breakdown-${index}`}><X size={14} /></button></div>)}<div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}><button className="button button-secondary" onClick={convert} data-testid="button-add-breakdown-to-plan"><ListChecks size={15} /> Add these to my plan</button></div></section>}<section style={{ marginTop: 35 }}><div className="section-title"><h2>Recent captures</h2><span>Only you can see these</span></div><div className="task-list">{state.captures.map((capture) => <div className="task-row" key={capture.id} data-testid={`row-capture-${capture.id}`}><div style={{ width: 22, height: 22, borderRadius: 7, background: 'hsl(var(--secondary))', display: 'grid', placeItems: 'center', color: 'hsl(var(--secondary-foreground))' }}><Brain size={13} /></div><div><div className="task-name" style={{ fontWeight: 500 }}>{capture.text}</div><div className="task-meta"><span>{capture.createdAt}</span>{capture.converted && <span className="task-tag">Added to plan</span>}</div></div><button className="icon-button" onClick={() => { update((s) => ({ ...s, captures: s.captures.filter((item) => item.id !== capture.id) })); setNotice('Capture deleted.'); }} aria-label="Delete capture" data-testid={`button-delete-capture-${capture.id}`}><Trash2 size={15} /></button></div>)}</div></section></div></div>;
}

function Me({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, update, reset, setNotice } = app;
  const accents = [{ name: 'Clay', value: '#e88870' }, { name: 'Olive', value: '#9fbfae' }, { name: 'Ochre', value: '#c49b59' }, { name: 'Berry', value: '#b9798c' }];
  return <div className="page-wrap"><PageHeader eyebrow="The way it feels" title={<>Make it <span className="serif">yours.</span></>} subtitle="A few gentle controls for how My Day holds your life." /><div className="settings-grid"><div className="stack"><section className="card settings-card"><h2>Preferences</h2><p>Small choices, saved on this device.</p><div className="setting-row"><div><strong>Dark mode</strong><span>Lower the lights for late-day planning.</span></div><button className={`switch ${state.preferences.dark ? 'on' : ''}`} onClick={() => update((s) => ({ ...s, preferences: { ...s.preferences, dark: !s.preferences.dark } }))} aria-label="Toggle dark mode" data-testid="switch-dark-mode" /></div><div className="setting-row"><div><strong>Helpful reminders</strong><span>A quiet nudge when a task has been waiting.</span></div><button className={`switch ${state.preferences.reminders ? 'on' : ''}`} onClick={() => update((s) => ({ ...s, preferences: { ...s.preferences, reminders: !s.preferences.reminders } }))} aria-label="Toggle reminders" data-testid="switch-reminders" /></div><div className="setting-row"><div><strong>Remember my patterns</strong><span>Keep preferences and planning context locally.</span></div><button className={`switch ${state.preferences.memory ? 'on' : ''}`} onClick={() => update((s) => ({ ...s, preferences: { ...s.preferences, memory: !s.preferences.memory } }))} aria-label="Toggle memory" data-testid="switch-memory" /></div></section><section className="card settings-card"><h2>Accent</h2><p>Choose the little spark that follows you around.</p><div className="swatches" role="radiogroup" aria-label="Accent color">{accents.map((accent) => <button key={accent.value} className={`swatch ${state.preferences.accent === accent.value ? 'selected' : ''}`} style={{ background: accent.value }} onClick={() => { update((s) => ({ ...s, preferences: { ...s.preferences, accent: accent.value } })); setNotice(`${accent.name} is a good choice.`); }} aria-label={`Use ${accent.name} accent`} data-testid={`button-accent-${accent.name.toLowerCase()}`} />)}</div></section></div><div className="stack"><section className="card settings-card"><h2>Your privacy</h2><p>My Day is designed to feel personal without being mysterious.</p><div className="soft-card" style={{ padding: 15, display: 'flex', gap: 11, alignItems: 'flex-start' }}><ShieldCheck size={18} color="hsl(var(--primary))" /><div><strong style={{ fontSize: 12 }}>Stored on this device</strong><p style={{ margin: '4px 0 0', fontSize: 11, lineHeight: 1.5 }}>Your tasks, captures, and preferences live in local storage. Nothing in this MVP is sent to an external assistant.</p></div></div><div className="setting-row"><div><strong>Clear all day data</strong><span>Return to the welcoming sample day.</span></div><button className="button button-danger" onClick={reset} data-testid="button-reset-data"><RotateCcw size={14} /> Reset</button></div></section><section className="soft-card" style={{ padding: 20 }}><div style={{ display: 'flex', gap: 11 }}><Keyboard size={17} color="hsl(var(--primary))" /><div><strong style={{ fontSize: 12 }}>A few useful keys</strong><p style={{ margin: '7px 0 0', color: 'hsl(var(--muted-foreground))', fontSize: 11, lineHeight: 1.65 }}>Use Command + Enter to save a quick capture. Your attention is the main interface.</p></div></div></section></div></div></div>;
}

function NotFoundView() { return <div className="page-wrap"><div className="empty-state" style={{ marginTop: '15vh' }}><Compass size={25} /><h1 className="page-title" style={{ fontSize: 35 }}>A quiet dead end.</h1><p>That page is not part of today.</p><Link className="button button-primary" href="/" data-testid="link-back-home">Back to today</Link></div></div>; }

function Router({ app }: { app: ReturnType<typeof useAppState> }) {
  return <Shell><ErrorBoundary resetKey={window.location.pathname}><Switch><Route path="/" component={() => <Home app={app} />} /><Route path="/plan" component={() => <Plan app={app} />} /><Route path="/projects" component={() => <Projects app={app} />} /><Route path="/capture" component={() => <CapturePage app={app} />} /><Route path="/me" component={() => <Me app={app} />} /><Route component={NotFoundView} /></Switch></ErrorBoundary></Shell>;
}

function App() {
  const app = useAppState();
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router app={app} /></WouterRouter><Toaster />{app.notice && <div className="toast-note" role="status" data-testid="status-toast">{app.notice}</div>}</TooltipProvider></QueryClientProvider>;
}

export default App;