import type { AttendanceStatus, DayCell } from "@/lib/attendance";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function slotClass(status: AttendanceStatus | null, future: boolean) {
  if (status === "present") return "bg-success";
  if (status === "absent") return "bg-destructive";
  if (status === "excused") return "bg-gold";
  return future ? "bg-muted" : "bg-border";
}

/** Month-by-month grid of the block, split into morning / afternoon halves. */
export function AttendanceCalendar({ cells }: { cells: DayCell[] }) {
  if (cells.length === 0)
    return <p className="text-sm text-muted-foreground">No dates in this block yet.</p>;

  const months = new Map<string, DayCell[]>();
  for (const c of cells) {
    const key = c.date.slice(0, 7);
    const list = months.get(key) ?? [];
    list.push(c);
    months.set(key, list);
  }

  return (
    <div className="space-y-6">
      {[...months.entries()].map(([month, days]) => {
        const first = new Date(days[0]!.date + "T00:00:00");
        const offset = Math.min((first.getDay() + 6) % 7, 5);
        return (
          <div key={month}>
            <p className="mb-2 text-sm font-semibold">
              {first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </p>
            <div className="grid grid-cols-6 gap-1.5 text-center">
              {WEEKDAYS.map((d) => (
                <span key={d} className="text-[10px] font-semibold uppercase text-muted-foreground">
                  {d}
                </span>
              ))}
              {Array.from({ length: offset }).map((_, i) => (
                <span key={`pad-${i}`} />
              ))}
              {days.map((cell) => (
                <div
                  key={cell.date}
                  title={`${cell.date} · morning: ${cell.morning ?? (cell.future ? "upcoming" : "not recorded")} · afternoon: ${cell.afternoon ?? (cell.future ? "upcoming" : "not recorded")}`}
                  className="rounded-xl border border-border/60 bg-card/60 p-1.5"
                >
                  <span className="block text-[11px] font-medium text-muted-foreground">
                    {Number(cell.date.slice(8, 10))}
                  </span>
                  <span className="mt-1 flex gap-0.5">
                    <span className={`h-2 flex-1 rounded-full ${slotClass(cell.morning, cell.future)}`} />
                    <span className={`h-2 flex-1 rounded-full ${slotClass(cell.afternoon, cell.future)}`} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <Legend className="bg-success" label="Present" />
        <Legend className="bg-destructive" label="Absent" />
        <Legend className="bg-gold" label="Excused" />
        <Legend className="bg-border" label="Not recorded" />
        <Legend className="bg-muted" label="Upcoming" />
        <span>Each day shows morning (left) and afternoon (right). Sundays are excluded.</span>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-5 rounded-full ${className}`} />
      {label}
    </span>
  );
}
