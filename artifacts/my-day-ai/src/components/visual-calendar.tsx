import { useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { getGetCalendarEventsQueryKey, useGetCalendarEvents } from "@workspace/api-client-react";

type CalendarView = "timeGridWeek" | "timeGridDay";

function initialRange() {
  const start = new Date();
  start.setDate(start.getDate() - start.getDay() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function VisualCalendar() {
  const [view, setView] = useState<CalendarView>("timeGridWeek");
  const [range, setRange] = useState(initialRange);
  const { data: events = [], isLoading, isError } = useGetCalendarEvents(range, {
    query: { queryKey: getGetCalendarEventsQueryKey(range), staleTime: 30_000, refetchOnWindowFocus: true },
  });

  const calendarEvents = useMemo(
    () =>
      events.map((event) => ({
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        backgroundColor: event.calendarColor ?? event.color ?? undefined,
        borderColor: event.calendarColor ?? event.color ?? undefined,
        classNames: event.calendarId === "my-day" ? ["my-day-scheduled-event"] : [],
      })),
    [events],
  );

  return (
    <section className="fullcalendar-card" aria-label="Weekly schedule">
      <div className="calendar-status-row" aria-live="polite">
        <span>{isLoading ? "Refreshing your schedule…" : isError ? "Some calendar events could not load." : "Your schedule updates automatically."}</span>
        <div className="calendar-view-controls" role="group" aria-label="Calendar view">
          <button className={`button ${view === "timeGridDay" ? "button-primary" : "button-ghost"}`} onClick={() => setView("timeGridDay")}>Day</button>
          <button className={`button ${view === "timeGridWeek" ? "button-primary" : "button-ghost"}`} onClick={() => setView("timeGridWeek")}>Week</button>
        </div>
      </div>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={view}
        headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
        buttonText={{ today: "Today" }}
        firstDay={1}
        nowIndicator
        allDaySlot={false}
        slotMinTime="06:00:00"
        slotMaxTime="22:00:00"
        expandRows
        height="auto"
        events={calendarEvents}
        datesSet={(info) => {
          setView(info.view.type as CalendarView);
          setRange({ start: info.start.toISOString(), end: info.end.toISOString() });
        }}
      />
    </section>
  );
}