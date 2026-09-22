import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  devAuditLog,
  devControls,
  devEmails,
  devEndSupport,
  devFlags,
  devHealth,
  devIntegrity,
  devPermissions,
  devRecalculateBlock,
  devResolveSecurityEvent,
  devRetryEmail,
  devRevokeAllSessions,
  devSearch,
  devSecurity,
  devSetControl,
  devSetFlag,
  devStartSupport,
  devSupportSessions,
  devSupportView,
  devUserAction,
  devUsers,
} from "@/lib/developer.functions";
import { Badge, Button, Field, Input, Modal, Select, Spinner } from "@/components/ui-kit";

/* ------------------------------- shared bits ------------------------------- */

export function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="dev-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({ label }: { label: string }) {
  return <p className="py-6 text-sm text-muted-foreground">{label}</p>;
}

const when = (value?: string | null) =>
  value ? new Date(value).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "—";

/* -------------------------------- global search ---------------------------- */

export function SearchSection() {
  const fn = useServerFn(devSearch);
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["dev", "search", q],
    queryFn: () => fn({ data: { q } }),
    enabled: q.length >= 2,
  });
  const r = query.data;

  return (
    <div className="grid gap-4">
      <Panel title="Global search" subtitle="People, cohorts, blocks, appeals and audit events across MII and MIU.">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (term.trim().length < 2) return toast.error("Type at least two characters.");
            setQ(term.trim());
          }}
        >
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search users, students, markers, cohorts, blocks, events…"
            className="min-w-[16rem] flex-1"
          />
          <Button type="submit">Search</Button>
        </form>
      </Panel>

      {query.isFetching ? <Spinner label="Searching" /> : null}

      {r ? (
        <>
          <Panel title={`People (${r.people.length})`}>
            {r.people.length ? (
              <Table head={["Name", "Email", "Number", "Institution", "Cohort", "Status"]}>
                {r.people.map((p: any) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-4">{p.full_name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{p.email ?? "—"}</td>
                    <td className="py-2 pr-4">{p.student_number ?? p.staff_id ?? "—"}</td>
                    <td className="py-2 pr-4">{p.institution}</td>
                    <td className="py-2 pr-4">{p.cohort?.name ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={p.is_active === false ? "red" : "green"}>
                        {p.is_active === false ? "Inactive" : "Active"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty label="No people matched." />
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={`Cohorts (${r.cohorts.length})`}>
              {r.cohorts.length ? (
                <Table head={["Cohort", "Programme", "Intake", "Institution"]}>
                  {r.cohorts.map((c: any) => (
                    <tr key={c.id}>
                      <td className="py-2 pr-4">{c.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{c.programme ?? "—"}</td>
                      <td className="py-2 pr-4">{c.intake_year ?? "—"}</td>
                      <td className="py-2 pr-4">{c.institution}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty label="No cohorts matched." />
              )}
            </Panel>
            <Panel title={`Blocks (${r.blocks.length})`}>
              {r.blocks.length ? (
                <Table head={["Block", "Dates", "Status", "Institution"]}>
                  {r.blocks.map((b: any) => (
                    <tr key={b.id}>
                      <td className="py-2 pr-4">{b.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {b.start_date} → {b.end_date}
                      </td>
                      <td className="py-2 pr-4">{b.status}</td>
                      <td className="py-2 pr-4">{b.institution}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty label="No blocks matched." />
              )}
            </Panel>
          </div>

          <Panel title={`Audit events (${r.audits.length})`}>
            {r.audits.length ? (
              <Table head={["When", "Who", "Action", "Entity"]}>
                {r.audits.map((a: any) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-4 text-muted-foreground">{when(a.created_at)}</td>
                    <td className="py-2 pr-4">{a.actor_email ?? "system"}</td>
                    <td className="py-2 pr-4">{a.action}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {a.entity} {a.entity_id ? `· ${String(a.entity_id).slice(0, 8)}` : ""}
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty label="No audit events matched." />
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------ users & accounts --------------------------- */

export function UsersSection() {
  const listFn = useServerFn(devUsers);
  const actFn = useServerFn(devUserAction);
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [institution, setInstitution] = useState<"all" | "MII" | "MIU">("all");
  const [role, setRole] = useState("all");
  const [temp, setTemp] = useState<{ name: string; password: string } | null>(null);

  const query = useQuery({
    queryKey: ["dev", "users", q, institution, role],
    queryFn: () => listFn({ data: { q, institution, role } }),
  });

  const act = useMutation({
    mutationFn: (input: { user_id: string; action: any; name: string }) =>
      actFn({ data: { user_id: input.user_id, action: input.action } }).then((r: any) => ({ ...r, name: input.name })),
    onSuccess: (r: any) => {
      toast.success(r.result);
      if (r.tempPassword) setTemp({ name: r.name, password: r.tempPassword });
      queryClient.invalidateQueries({ queryKey: ["dev"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That action did not go through."),
  });

  return (
    <div className="grid gap-4">
      <Panel
        title="Users & accounts"
        subtitle="Status, role, institution, cohort, last sign-in and failed attempts — across both institutions."
      >
        <div className="flex flex-wrap gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="min-w-[14rem] flex-1" />
          <Select value={institution} onChange={(e) => setInstitution(e.target.value as any)}>
            <option value="all">All institutions</option>
            <option value="MII">MII</option>
            <option value="MIU">MIU</option>
          </Select>
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="all">All roles</option>
            <option value="student">Students</option>
            <option value="marker">Markers</option>
            <option value="admin">Admins</option>
            <option value="staff">Staff</option>
            <option value="head_of_meditation">Head of meditation</option>
            <option value="developer">Developer</option>
          </Select>
        </div>
      </Panel>

      <Panel title={`${query.data?.length ?? 0} accounts`}>
        {query.isLoading ? (
          <Spinner label="Loading accounts" />
        ) : query.data?.length ? (
          <Table head={["Name", "Roles", "Institution", "Cohort", "Last sign-in", "Failed", "Status", "Actions"]}>
            {query.data.map((p: any) => (
              <tr key={p.id}>
                <td className="py-2 pr-4">
                  <span className="block">{p.full_name}</span>
                  <span className="block text-xs text-muted-foreground">{p.email ?? "no email"}</span>
                </td>
                <td className="py-2 pr-4 text-xs">{p.roles.join(", ") || "none"}</td>
                <td className="py-2 pr-4">{p.institution}</td>
                <td className="py-2 pr-4">{p.cohort?.name ?? "—"}</td>
                <td className="py-2 pr-4 text-xs text-muted-foreground">{when(p.last_login)}</td>
                <td className="py-2 pr-4">
                  {p.failed_logins ? <Badge tone="amber">{p.failed_logins}</Badge> : <span className="text-muted-foreground">0</span>}
                </td>
                <td className="py-2 pr-4">
                  <Badge tone={p.is_active === false ? "red" : "green"}>
                    {p.is_active === false ? "Inactive" : "Active"}
                  </Badge>
                </td>
                <td className="py-2 pr-4">
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        act.mutate({
                          user_id: p.id,
                          action: p.is_active === false ? "activate" : "deactivate",
                          name: p.full_name,
                        })
                      }
                    >
                      {p.is_active === false ? "Activate" : "Deactivate"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act.mutate({ user_id: p.id, action: "force_logout", name: p.full_name })}>
                      Sign out
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act.mutate({ user_id: p.id, action: "reset_password", name: p.full_name })}>
                      Reset password
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty label="No accounts matched those filters." />
        )}
      </Panel>

      {temp ? (
        <Modal open title="Temporary password" onClose={() => setTemp(null)}>
          <p className="text-sm">
            Give this one-time password to {temp.name}. They will be asked to change it after signing in. It is shown
            once and is never stored in the activity history.
          </p>
          <p className="mt-3 rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm">{temp.password}</p>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setTemp(null)}>Done</Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/* ------------------------------- security centre --------------------------- */

export function SecuritySection() {
  const fn = useServerFn(devSecurity);
  const resolveFn = useServerFn(devResolveSecurityEvent);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["dev", "security"], queryFn: () => fn() });
  const resolve = useMutation({
    mutationFn: (id: string) => resolveFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Marked as handled");
      queryClient.invalidateQueries({ queryKey: ["dev"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update that alert."),
  });

  if (query.isLoading) return <Spinner label="Loading security activity" />;
  const d = query.data;

  return (
    <div className="grid gap-4">
      <Panel title="Accounts with repeated failed sign-ins" subtitle="Five or more failures in the recent history.">
        {d?.lockouts.length ? (
          <Table head={["Email", "Failed attempts"]}>
            {d.lockouts.map((l: any) => (
              <tr key={l.email}>
                <td className="py-2 pr-4">{l.email}</td>
                <td className="py-2 pr-4">
                  <Badge tone="red">{l.attempts}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty label="No accounts are showing repeated failures." />
        )}
      </Panel>

      <Panel title="Security alerts" subtitle="Permission denials and unauthorised access attempts.">
        {d?.events.length ? (
          <Table head={["When", "Kind", "Severity", "Detail", "Institution", ""]}>
            {d.events.map((e: any) => (
              <tr key={e.id}>
                <td className="py-2 pr-4 text-xs text-muted-foreground">{when(e.created_at)}</td>
                <td className="py-2 pr-4">{e.kind}</td>
                <td className="py-2 pr-4">
                  <Badge tone={e.severity === "critical" ? "red" : e.severity === "warning" ? "amber" : "neutral"}>
                    {e.severity}
                  </Badge>
                </td>
                <td className="py-2 pr-4 text-xs">{e.detail ?? "—"}</td>
                <td className="py-2 pr-4">{e.institution ?? "—"}</td>
                <td className="py-2 pr-4">
                  {e.resolved_at ? (
                    <Badge tone="green">Handled</Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => resolve.mutate(e.id)}>
                      Mark handled
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty label="No security alerts recorded." />
        )}
      </Panel>

      <Panel title="Failed sign-in attempts">
        {d?.failures.length ? (
          <Table head={["When", "Email", "Reason", "Portal", "Device"]}>
            {d.failures.map((f: any) => (
              <tr key={f.id}>
                <td className="py-2 pr-4 text-xs text-muted-foreground">{when(f.created_at)}</td>
                <td className="py-2 pr-4">{f.email ?? "—"}</td>
                <td className="py-2 pr-4 text-xs">{f.reason ?? "—"}</td>
                <td className="py-2 pr-4">{f.role ?? "—"}</td>
                <td className="py-2 pr-4 max-w-[18rem] truncate text-xs text-muted-foreground">{f.user_agent ?? "—"}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty label="No failed sign-ins recorded yet." />
        )}
      </Panel>
    </div>
  );
}

/* ---------------------------------- audit log ------------------------------ */

export function AuditSection() {
  const fn = useServerFn(devAuditLog);
  const [q, setQ] = useState("");
  const query = useQuery({ queryKey: ["dev", "audit", q], queryFn: () => fn({ data: { q, limit: 200 } }) });

  return (
    <div className="grid gap-4">
      <Panel title="Audit log" subtitle="Every recorded action, with who did it and when. Records cannot be edited or removed.">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by action, person or record" />
      </Panel>
      <Panel title="Actions">
        {query.isLoading ? (
          <Spinner label="Loading audit history" />
        ) : query.data?.logs.length ? (
          <Table head={["When", "Who", "Action", "Record", "Details"]}>
            {query.data.logs.map((a: any) => (
              <tr key={a.id}>
                <td className="py-2 pr-4 text-xs text-muted-foreground">{when(a.created_at)}</td>
                <td className="py-2 pr-4">{a.actor_email ?? "system"}</td>
                <td className="py-2 pr-4">{a.action}</td>
                <td className="py-2 pr-4 text-xs">{a.entity}</td>
                <td className="py-2 pr-4 max-w-[22rem] truncate text-xs text-muted-foreground">
                  {JSON.stringify(a.details ?? {})}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty label="No audit records yet." />
        )}
      </Panel>
      <Panel title="Sign-in activity">
        {query.data?.signIns.length ? (
          <Table head={["When", "Email", "Outcome", "Institution", "Portal", "Device"]}>
            {query.data.signIns.map((s: any) => (
              <tr key={s.id}>
                <td className="py-2 pr-4 text-xs text-muted-foreground">{when(s.created_at)}</td>
                <td className="py-2 pr-4">{s.email ?? "—"}</td>
                <td className="py-2 pr-4">
                  <Badge tone={s.succeeded ? "green" : "red"}>{s.succeeded ? "Success" : "Failed"}</Badge>
                </td>
                <td className="py-2 pr-4">{s.institution ?? "—"}</td>
                <td className="py-2 pr-4">{s.role ?? "—"}</td>
                <td className="py-2 pr-4 max-w-[16rem] truncate text-xs text-muted-foreground">{s.user_agent ?? "—"}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty label="No sign-ins recorded yet." />
        )}
      </Panel>
    </div>
  );
}

/* --------------------------- permission inspector -------------------------- */

export function PermissionsSection() {
  const listFn = useServerFn(devUsers);
  const permFn = useServerFn(devPermissions);
  const [userId, setUserId] = useState("");
  const people = useQuery({ queryKey: ["dev", "users", "picker"], queryFn: () => listFn({ data: {} }) });
  const perms = useQuery({
    queryKey: ["dev", "permissions", userId],
    queryFn: () => permFn({ data: { user_id: userId } }),
    enabled: !!userId,
  });

  return (
    <div className="grid gap-4">
      <Panel title="Permission inspector" subtitle="Exactly what one account may reach.">
        <Field label="Account">
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Choose a person…</option>
            {(people.data ?? []).map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.full_name} · {p.institution} · {p.roles.join("/") || "no role"}
              </option>
            ))}
          </Select>
        </Field>
      </Panel>

      {perms.isFetching ? <Spinner label="Working out access" /> : null}
      {perms.data ? (
        <>
          <Panel title={perms.data.profile.full_name} subtitle={`${perms.data.institution} · ${perms.data.roles.join(", ") || "no role"}`}>
            <ul className="grid gap-1 text-sm">
              {perms.data.abilities.map((a: string) => (
                <li key={a} className="flex gap-2">
                  <span className="text-primary">•</span>
                  {a}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Reachable people: {perms.data.studentCount} · cohorts: {perms.data.cohorts.length} · blocks:{" "}
              {perms.data.blocks.length}
            </p>
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Cohorts in scope">
              {perms.data.cohorts.length ? (
                <ul className="grid gap-1 text-sm">
                  {perms.data.cohorts.map((c: any) => (
                    <li key={c.id}>{c.name}</li>
                  ))}
                </ul>
              ) : (
                <Empty label="No cohorts in scope." />
              )}
            </Panel>
            <Panel title="Blocks in scope">
              {perms.data.blocks.length ? (
                <ul className="grid gap-1 text-sm">
                  {perms.data.blocks.map((b: any) => (
                    <li key={b.id}>
                      {b.name} <span className="text-xs text-muted-foreground">({b.status})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty label="No blocks in scope." />
              )}
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------- support view ----------------------------- */

export function SupportSection() {
  const listFn = useServerFn(devUsers);
  const sessionsFn = useServerFn(devSupportSessions);
  const startFn = useServerFn(devStartSupport);
  const endFn = useServerFn(devEndSupport);
  const viewFn = useServerFn(devSupportView);
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [sessionId, setSessionId] = useState("");

  const people = useQuery({ queryKey: ["dev", "users", "picker"], queryFn: () => listFn({ data: {} }) });
  const sessions = useQuery({ queryKey: ["dev", "support"], queryFn: () => sessionsFn() });
  const view = useQuery({
    queryKey: ["dev", "support", "view", sessionId],
    queryFn: () => viewFn({ data: { session_id: sessionId } }),
    enabled: !!sessionId,
  });

  const start = useMutation({
    mutationFn: () => startFn({ data: { user_id: userId, reason, minutes } }),
    onSuccess: (row: any) => {
      toast.success("Support mode opened (read-only)");
      setSessionId(row.id);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["dev", "support"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not open support mode."),
  });
  const end = useMutation({
    mutationFn: (id: string) => endFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Support session closed");
      setSessionId("");
      queryClient.invalidateQueries({ queryKey: ["dev", "support"] });
    },
  });

  return (
    <div className="grid gap-4">
      <Panel
        title="Developer support mode"
        subtitle="Read-only, time-limited and fully recorded. Passwords and tokens are never shown."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Person">
            <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Choose a person…</option>
              {(people.data ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} · {p.institution}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you looking?" />
          </Field>
          <Field label="Time limit">
            <Select value={String(minutes)} onChange={(e) => setMinutes(Number(e.target.value))}>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="240">4 hours</option>
            </Select>
          </Field>
        </div>
        <div className="mt-3">
          <Button
            onClick={() => {
              if (!userId) return toast.error("Choose a person first.");
              if (reason.trim().length < 5) return toast.error("Write a short reason (at least 5 characters).");
              start.mutate();
            }}
          >
            Open support mode
          </Button>
        </div>
      </Panel>

      {view.data ? (
        <Panel
          title={`Support mode · ${view.data.profile?.full_name ?? "account"}`}
          subtitle={`Read-only · expires ${when(view.data.session.expires_at)}`}
          action={
            <Button variant="outline" size="sm" onClick={() => end.mutate(view.data!.session.id)}>
              Close support mode
            </Button>
          }
        >
          <Badge tone="amber">Developer support mode · read-only</Badge>
          <p className="mt-3 text-sm text-muted-foreground">
            {view.data.profile?.institution} · {view.data.profile?.cohort?.name ?? "no cohort"} ·{" "}
            {view.data.roles.join(", ") || "no role"}
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Recent meditation marks</h3>
              {view.data.attendance.length ? (
                <Table head={["Date", "Session", "Points", "Status"]}>
                  {view.data.attendance.slice(0, 15).map((a: any, i: number) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-4">{a.session_date}</td>
                      <td className="py-1.5 pr-4">{a.slot}</td>
                      <td className="py-1.5 pr-4">{a.points}</td>
                      <td className="py-1.5 pr-4 text-xs text-muted-foreground">{a.status}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty label="No meditation marks." />
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Recent class marks</h3>
              {view.data.classMarks.length ? (
                <Table head={["Date", "Class", "Points", "Type"]}>
                  {view.data.classMarks.slice(0, 15).map((c: any, i: number) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-4">{c.session?.session_date}</td>
                      <td className="py-1.5 pr-4">{c.session?.title}</td>
                      <td className="py-1.5 pr-4">{c.points}</td>
                      <td className="py-1.5 pr-4 text-xs text-muted-foreground">{c.mode}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty label="No class marks." />
              )}
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel title="Support history">
        {sessions.data?.length ? (
          <Table head={["Opened", "Person", "Reason", "Expires", "State", ""]}>
            {sessions.data.map((s: any) => (
              <tr key={s.id}>
                <td className="py-2 pr-4 text-xs text-muted-foreground">{when(s.created_at)}</td>
                <td className="py-2 pr-4">{s.target?.full_name ?? "—"}</td>
                <td className="py-2 pr-4 text-xs">{s.reason}</td>
                <td className="py-2 pr-4 text-xs text-muted-foreground">{when(s.expires_at)}</td>
                <td className="py-2 pr-4">
                  <Badge tone={s.ended_at ? "neutral" : new Date(s.expires_at) < new Date() ? "amber" : "green"}>
                    {s.ended_at ? "Closed" : new Date(s.expires_at) < new Date() ? "Expired" : "Open"}
                  </Badge>
                </td>
                <td className="py-2 pr-4">
                  {!s.ended_at && new Date(s.expires_at) > new Date() ? (
                    <Button size="sm" variant="outline" onClick={() => setSessionId(s.id)}>
                      Open
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty label="No support sessions yet." />
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------- data integrity ---------------------------- */

export function IntegritySection() {
  const fn = useServerFn(devIntegrity);
  const query = useQuery({ queryKey: ["dev", "integrity"], queryFn: () => fn() });
  if (query.isLoading) return <Spinner label="Checking the data" />;
  const d = query.data;

  return (
    <div className="grid gap-4">
      <Panel title="Data integrity" subtitle="Orphaned records, missing institutions or cohorts, duplicates and cross-institution mix-ups.">
        <p className="text-sm text-muted-foreground">
          Checked {d?.checked.people} people, {d?.checked.attendance} meditation marks, {d?.checked.classMarks} class
          marks and {d?.checked.blocks} blocks.
        </p>
      </Panel>
      {d?.issues.length ? (
        d.issues.map((issue: any) => (
          <Panel
            key={issue.kind}
            title={issue.label}
            action={<Badge tone={issue.severity === "error" ? "red" : "amber"}>{issue.items.length}</Badge>}
          >
            <ul className="grid gap-1 text-sm">
              {issue.items.map((i: string, idx: number) => (
                <li key={idx} className="text-muted-foreground">
                  {i}
                </li>
              ))}
            </ul>
          </Panel>
        ))
      ) : (
        <Panel title="All clear">
          <Empty label="No integrity problems found." />
        </Panel>
      )}
    </div>
  );
}

/* --------------------------------- email centre ---------------------------- */

export function EmailSection() {
  const fn = useServerFn(devEmails);
  const retryFn = useServerFn(devRetryEmail);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["dev", "emails"], queryFn: () => fn() });
  const retry = useMutation({
    mutationFn: (id: string) => retryFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Queued to send again");
      queryClient.invalidateQueries({ queryKey: ["dev", "emails"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not queue that email."),
  });

  const counts = useMemo(() => {
    const rows = query.data ?? [];
    const n = (s: string) => rows.filter((r: any) => r.status === s).length;
    return { sent: n("sent"), delivered: n("delivered"), failed: n("failed"), bounced: n("bounced"), pending: n("pending") };
  }, [query.data]);

  return (
    <div className="grid gap-4">
      <Panel title="Email centre" subtitle="Sent, delivered, failed, bounced and pending notices.">
        <div className="grid gap-2 sm:grid-cols-5">
          {Object.entries(counts).map(([k, v]) => (
            <div key={k} className="rounded-xl border border-border bg-muted/40 px-3 py-2">
              <span className="block text-lg font-semibold">{v}</span>
              <span className="text-xs capitalize text-muted-foreground">{k}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          No sending domain is verified yet, so notices are recorded here and will send once the domain is live.
        </p>
      </Panel>
      <Panel title="Recent emails">
        {query.isLoading ? (
          <Spinner label="Loading emails" />
        ) : query.data?.length ? (
          <Table head={["When", "To", "Subject", "Status", "Problem", ""]}>
            {query.data.map((e: any) => (
              <tr key={e.id}>
                <td className="py-2 pr-4 text-xs text-muted-foreground">{when(e.created_at)}</td>
                <td className="py-2 pr-4">{e.recipient}</td>
                <td className="py-2 pr-4">{e.subject}</td>
                <td className="py-2 pr-4">
                  <Badge
                    tone={
                      e.status === "failed" || e.status === "bounced"
                        ? "red"
                        : e.status === "pending"
                          ? "amber"
                          : "green"
                    }
                  >
                    {e.status}
                  </Badge>
                </td>
                <td className="py-2 pr-4 text-xs text-muted-foreground">{e.error ?? "—"}</td>
                <td className="py-2 pr-4">
                  {e.status === "failed" || e.status === "bounced" ? (
                    <Button size="sm" variant="outline" onClick={() => retry.mutate(e.id)}>
                      Send again
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty label="No emails have been recorded yet." />
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------ developer tools ---------------------------- */

export function ToolsSection() {
  const recalcFn = useServerFn(devRecalculateBlock);
  const revokeFn = useServerFn(devRevokeAllSessions);
  const searchFn = useServerFn(devSearch);
  const [blockTerm, setBlockTerm] = useState("");
  const [blockId, setBlockId] = useState("");
  const [confirming, setConfirming] = useState(false);

  const blocks = useQuery({
    queryKey: ["dev", "search", "blocks", blockTerm],
    queryFn: () => searchFn({ data: { q: blockTerm } }),
    enabled: blockTerm.length >= 2,
  });

  const recalc = useMutation({
    mutationFn: () => recalcFn({ data: { block_id: blockId } }),
    onSuccess: (r: any) => toast.success(`Checked ${r.rows} marks · repaired ${r.repaired}`),
    onError: (e: any) => toast.error(e?.message ?? "Could not run that check."),
  });
  const revoke = useMutation({
    mutationFn: () => revokeFn({ data: { confirm: "CONFIRM" as const } }),
    onSuccess: (r: any) => {
      toast.success(`Signed out ${r.revoked} accounts`);
      setConfirming(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not revoke sessions."),
  });

  return (
    <div className="grid gap-4">
      <Panel
        title="Recheck a block"
        subtitle="Repairs bookkeeping only — recorded points and the attendance rules are never changed."
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input value={blockTerm} onChange={(e) => setBlockTerm(e.target.value)} placeholder="Search a block by name" />
          <Button
            onClick={() => {
              if (!blockId) return toast.error("Pick a block first.");
              recalc.mutate();
            }}
          >
            Recheck block
          </Button>
        </div>
        {blocks.data?.blocks.length ? (
          <Select className="mt-3" value={blockId} onChange={(e) => setBlockId(e.target.value)}>
            <option value="">Choose a block…</option>
            {blocks.data.blocks.map((b: any) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.institution}
              </option>
            ))}
          </Select>
        ) : null}
      </Panel>

      <Panel title="Sign everyone out" subtitle="Ends every active session except yours. Recorded in the audit log.">
        <Button variant="outline" onClick={() => setConfirming(true)}>
          Revoke all sessions
        </Button>
      </Panel>

      {confirming ? (
        <Modal open title="Sign everyone out?" onClose={() => setConfirming(false)}>
          <p className="text-sm">
            Everyone signed in — students, markers, staff and admins at both institutions — will need to sign in again.
            This is recorded against your account.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={() => revoke.mutate()}>Yes, sign everyone out</Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/* -------------------------------- system health ---------------------------- */

export function HealthSection() {
  const fn = useServerFn(devHealth);
  const query = useQuery({ queryKey: ["dev", "health"], queryFn: () => fn(), refetchInterval: 60_000 });
  if (query.isLoading) return <Spinner label="Checking the system" />;
  const d = query.data!;
  const cards = [
    { label: "Database", ok: d.database.ok, detail: `${d.database.message} · ${d.database.ms}ms` },
    { label: "Authentication", ok: d.auth.ok, detail: d.auth.message },
    { label: "Storage", ok: d.storage.ok, detail: d.storage.buckets.join(", ") || d.storage.message },
    { label: "Email service", ok: d.email.ok, detail: d.email.message },
  ];

  return (
    <div className="grid gap-4">
      <Panel title="System health" subtitle={d.version}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="rounded-xl border border-border bg-muted/40 p-3">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${c.ok ? "bg-success" : "bg-destructive"}`} />
                <span className="text-sm font-semibold">{c.label}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{c.detail}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Recent problems">
        {d.recentErrors.length ? (
          <Table head={["When", "Kind", "Detail"]}>
            {d.recentErrors.map((e: any) => (
              <tr key={e.id}>
                <td className="py-2 pr-4 text-xs text-muted-foreground">{when(e.created_at)}</td>
                <td className="py-2 pr-4">{e.kind}</td>
                <td className="py-2 pr-4 text-xs">{e.detail ?? "—"}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty label="Nothing has gone wrong recently." />
        )}
      </Panel>
    </div>
  );
}

/* -------------------------------- feature flags ---------------------------- */

export function FlagsSection() {
  const fn = useServerFn(devFlags);
  const setFn = useServerFn(devSetFlag);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["dev", "flags"], queryFn: () => fn() });
  const update = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) => setFn({ data: input }),
    onSuccess: () => {
      toast.success("Updated");
      queryClient.invalidateQueries({ queryKey: ["dev", "flags"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not change that feature."),
  });

  return (
    <Panel title="Feature flags" subtitle="Turn parts of the platform on or off per institution — no code change needed.">
      {query.isLoading ? (
        <Spinner label="Loading features" />
      ) : query.data?.length ? (
        <Table head={["Feature", "Institution", "State", ""]}>
          {query.data.map((f: any) => (
            <tr key={f.id}>
              <td className="py-2 pr-4">
                <span className="block">{f.label}</span>
                <span className="block text-xs text-muted-foreground">{f.description ?? f.key}</span>
              </td>
              <td className="py-2 pr-4">{f.institution ?? "Both"}</td>
              <td className="py-2 pr-4">
                <Badge tone={f.enabled ? "green" : "neutral"}>{f.enabled ? "On" : "Off"}</Badge>
              </td>
              <td className="py-2 pr-4">
                <Button size="sm" variant="outline" onClick={() => update.mutate({ id: f.id, enabled: !f.enabled })}>
                  {f.enabled ? "Turn off" : "Turn on"}
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty label="No features listed." />
      )}
    </Panel>
  );
}

/* ----------------------------- emergency controls -------------------------- */

export function EmergencySection() {
  const fn = useServerFn(devControls);
  const setFn = useServerFn(devSetControl);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["dev", "controls"], queryFn: () => fn() });
  const [pending, setPending] = useState<any | null>(null);
  const [note, setNote] = useState("");
  const [typed, setTyped] = useState("");

  const update = useMutation({
    mutationFn: () =>
      setFn({ data: { key: pending.key, enabled: !pending.enabled, note, confirm: "CONFIRM" as const } }),
    onSuccess: () => {
      toast.success("Control updated");
      setPending(null);
      setNote("");
      setTyped("");
      queryClient.invalidateQueries({ queryKey: ["dev"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not change that control."),
  });

  return (
    <div className="grid gap-4">
      <Panel title="Emergency controls" subtitle="Strong confirmation required. Every change is recorded against your account.">
        {query.isLoading ? (
          <Spinner label="Loading controls" />
        ) : (
          <Table head={["Control", "State", "Note", ""]}>
            {(query.data ?? []).map((c: any) => (
              <tr key={c.key}>
                <td className="py-2 pr-4">
                  <span className="block">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">{c.description ?? c.key}</span>
                </td>
                <td className="py-2 pr-4">
                  <Badge tone={c.enabled ? "red" : "green"}>{c.enabled ? "Active" : "Normal"}</Badge>
                </td>
                <td className="py-2 pr-4 text-xs text-muted-foreground">{c.note ?? "—"}</td>
                <td className="py-2 pr-4">
                  <Button size="sm" variant="outline" onClick={() => setPending(c)}>
                    {c.enabled ? "Turn off" : "Turn on"}
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      {pending ? (
        <Modal open title={pending.enabled ? `Turn off ${pending.label}?` : `Turn on ${pending.label}?`} onClose={() => setPending(null)}>
          <p className="text-sm">
            This affects everyone at both institutions immediately. Type <span className="font-mono">CONFIRM</span> to
            continue.
          </p>
          <Field label="Note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why are you doing this?" />
          </Field>
          <Field label="Type CONFIRM">
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="CONFIRM" />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (typed !== "CONFIRM") return toast.error("Type CONFIRM exactly to continue.");
                update.mutate();
              }}
            >
              Apply
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
