import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { devAuditLog, devOverview, devSecurity } from "@/lib/developer.functions";
import { Empty, Panel, Table } from "@/components/developer/sections";
import { Badge, Spinner } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/developer/")({
  head: () => ({
    meta: [
      { title: "Developer dashboard · MII / MIU platform oversight" },
      {
        name: "description",
        content:
          "Live overview of the MII and MIU attendance platform: accounts, today's marking activity, sign-in history, security alerts and open appeals.",
      },
      { property: "og:title", content: "Developer dashboard · MII / MIU" },
      {
        property: "og:description",
        content: "Accounts, marking activity, sign-in history, security alerts and open appeals at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeveloperDashboard,
});

const when = (value?: string | null) =>
  value ? new Date(value).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "—";

function Stat({
  value,
  label,
  hint,
  tone = "primary",
}: {
  value: React.ReactNode;
  label: string;
  hint?: string;
  tone?: "primary" | "gold" | "danger" | "muted";
}) {
  const tints = {
    primary: "bg-primary/15 text-primary",
    gold: "bg-gold/20 text-gold",
    danger: "bg-destructive/15 text-destructive",
    muted: "bg-muted text-muted-foreground",
  } as const;
  return (
    <div className="dev-card p-4">
      <span className={`mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${tints[tone]}`}>
        ●
      </span>
      <p className="font-display text-2xl font-semibold">{value}</p>
      <p className="text-sm">{label}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function DeveloperDashboard() {
  const overviewFn = useServerFn(devOverview);
  const securityFn = useServerFn(devSecurity);
  const auditFn = useServerFn(devAuditLog);

  const overview = useQuery({ queryKey: ["dev", "overview"], queryFn: () => overviewFn(), refetchInterval: 60_000 });
  const security = useQuery({ queryKey: ["dev", "security"], queryFn: () => securityFn() });
  const audit = useQuery({ queryKey: ["dev", "audit", ""], queryFn: () => auditFn({ data: { limit: 20 } }) });

  if (overview.isLoading) return <Spinner label="Loading the platform overview" />;
  const d = overview.data!;
  const activeControls = (d.controls ?? []).filter((c: any) => c.enabled);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Platform overview</h1>
          <p className="text-sm text-muted-foreground">Everything happening across MII and MIU.</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleString("en-ZA", { dateStyle: "full", timeStyle: "short" })}
        </p>
      </div>

      {activeControls.length ? (
        <div className="dev-card border-destructive/60 p-4">
          <p className="text-sm font-semibold text-destructive">Emergency controls are active</p>
          <p className="text-xs text-muted-foreground">
            {activeControls.map((c: any) => c.label).join(", ")} ·{" "}
            <Link to="/developer/$section" params={{ section: "emergency" }} className="underline">
              manage
            </Link>
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat value={d.users.total} label="Total accounts" hint={`${d.users.mii} MII · ${d.users.miu} MIU`} />
        <Stat value={d.users.students} label="Students" hint={`${d.users.inactive} inactive accounts`} tone="gold" />
        <Stat value={d.users.admins} label="Admins" hint={`${d.users.staff} staff`} tone="muted" />
        <Stat value={d.users.markers} label="Markers" hint={`${d.activity.activeMarkers} active in the last hour`} />
        <Stat
          value={d.activity.attendanceToday}
          label="Marks today"
          hint={`${d.activity.classMarks24h} class marks in 24h`}
          tone="gold"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={d.activity.failedLogins24h} label="Failed sign-ins (24h)" tone="danger" />
        <Stat value={d.openSecurityEvents} label="Open security alerts" tone="danger" />
        <Stat value={d.appeals.open} label="Open appeals" hint={`${d.appeals.total} in total`} tone="gold" />
        <Stat value={d.emails.failed} label="Email problems" hint={`${d.emails.pending} pending`} tone="danger" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Security alerts"
          subtitle="Permission denials and unauthorised attempts."
          action={
            <Link to="/developer/$section" params={{ section: "security" }} className="text-xs text-primary underline">
              View all
            </Link>
          }
        >
          {security.data?.events.length ? (
            <ul className="grid gap-2 text-sm">
              {security.data.events.slice(0, 6).map((e: any) => (
                <li key={e.id} className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block">{e.kind}</span>
                    <span className="block text-xs text-muted-foreground">{e.detail ?? "—"}</span>
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{when(e.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty label="No security alerts." />
          )}
        </Panel>

        <Panel
          title="Recent sign-in activity"
          subtitle="Who signed in, and when."
          action={
            <Link to="/developer/$section" params={{ section: "audit" }} className="text-xs text-primary underline">
              View all
            </Link>
          }
        >
          {audit.data?.signIns.length ? (
            <Table head={["Email", "Outcome", "Institution", "When"]}>
              {audit.data.signIns.slice(0, 8).map((s: any) => (
                <tr key={s.id}>
                  <td className="py-2 pr-4">{s.email ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={s.succeeded ? "green" : "red"}>{s.succeeded ? "Success" : "Failed"}</Badge>
                  </td>
                  <td className="py-2 pr-4">{s.institution ?? "—"}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{when(s.created_at)}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty label="No sign-ins recorded yet." />
          )}
        </Panel>
      </div>

      <Panel
        title="Recent audit events"
        subtitle="Every action, immutable."
        action={
          <Link to="/developer/$section" params={{ section: "audit" }} className="text-xs text-primary underline">
            View all
          </Link>
        }
      >
        {audit.data?.logs.length ? (
          <Table head={["When", "Who", "Action", "Record"]}>
            {audit.data.logs.slice(0, 10).map((a: any) => (
              <tr key={a.id}>
                <td className="py-2 pr-4 text-xs text-muted-foreground">{when(a.created_at)}</td>
                <td className="py-2 pr-4">{a.actor_email ?? "system"}</td>
                <td className="py-2 pr-4">{a.action}</td>
                <td className="py-2 pr-4 text-xs text-muted-foreground">{a.entity}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty label="No audit events yet." />
        )}
      </Panel>

      <Panel title="Quick actions">
        <div className="flex flex-wrap gap-2 text-sm">
          {[
            { to: "/developer/users", label: "Unlock or reset an account" },
            { to: "/developer/tools", label: "Recheck a block" },
            { to: "/developer/support", label: "View as a user" },
            { to: "/developer/email", label: "Email centre" },
            { to: "/developer/emergency", label: "Emergency controls" },
          ].map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="rounded-xl border border-border bg-card/60 px-3 py-2 transition hover:bg-accent"
            >
              {a.label}
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
