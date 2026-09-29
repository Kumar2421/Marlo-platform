import type { ActivityEvent } from "@/lib/platform-data";

export function ActivityPanel({ events }: { events: ActivityEvent[] }) {
  if (!events.length) {
    return <div className="empty activity-empty"><strong>ACTIVITY STREAM</strong><span>No platform events recorded yet.</span></div>;
  }

  return (
    <div className="activity-panel">
      {events.map((event) => (
        <div className="activity-row" key={event.id}>
          <span className={`activity-dot ${event.severity}`} />
          <div className="activity-main">
            <strong>{event.label}</strong>
            <span>{event.source}{event.projectId ? ` · project ${event.projectId.slice(0, 8)}` : ""}</span>
          </div>
          <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
        </div>
      ))}
    </div>
  );
}
