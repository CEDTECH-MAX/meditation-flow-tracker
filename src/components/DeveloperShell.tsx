import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  ClipboardList,
  Database,
  Gauge,
  GraduationCap,
  Mail,
  Search,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Stethoscope,
  ToggleLeft,
  Users,
  Wrench,
} from "lucide-react";
import { getDeveloperMe } from "@/lib/developer.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui-kit";

export function useDeveloper() {
  const fn = useServerFn(getDeveloperMe);
  return useQuery({
    queryKey: ["dev", "me"],
    queryFn: async () => {
      let session = (await supabase.auth.getSession()).data.session;
      for (let attempt = 0; !session && attempt < 5; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        session = (await supabase.auth.getSession()).data.session;
      }
      if (!session) return null;
      return fn();
    },
    staleTime: 60_000,
    retry: 1,
  });
}

type NavItem = { to: string; label: string; icon: React.ElementType; exact?: boolean };

const groups: { title: string; items: NavItem[] }[] = [
  {
    title: "Monitoring",
    items: [
      { to: "/developer", label: "Dashboard", icon: Gauge, exact: true },
      { to: "/developer/search", label: "Global search", icon: Search },
      { to: "/developer/security", label: "Security centre", icon: ShieldCheck },
      { to: "/developer/audit", label: "Audit log", icon: ClipboardList },
    ],
  },
  {
    title: "User management",
    items: [
      { to: "/developer/users", label: "Users & accounts", icon: Users },
      { to: "/developer/permissions", label: "Permission inspector", icon: SlidersHorizontal },
      { to: "/developer/support", label: "Support view", icon: Stethoscope },
    ],
  },
  {
    title: "Data & integrity",
    items: [
      { to: "/developer/integrity", label: "Data integrity", icon: Database },
      { to: "/developer/email", label: "Email centre", icon: Mail },
    ],
  },
  {
    title: "Developer tools",
    items: [
      { to: "/developer/tools", label: "Developer tools", icon: Wrench },
      { to: "/developer/health", label: "System health", icon: Activity },
      { to: "/developer/flags", label: "Feature flags", icon: ToggleLeft },
      { to: "/developer/emergency", label: "Emergency controls", icon: Siren },
    ],
  },
];

export function DeveloperShell({ children, alerts = 0 }: { children: React.ReactNode; alerts?: number }) {
  const { data: me } = useDeveloper();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/developer-signin", replace: true });
  }

  return (
    <div className="dev-portal min-h-screen lg:flex">
      <aside className="border-b border-border lg:min-h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
            <GraduationCap className="h-5 w-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">MII / MIU</span>
            <span className="block text-xs text-muted-foreground">Developer Portal</span>
          </span>
        </div>
        <nav className="grid gap-4 px-3 pb-6">
          {groups.map((group) => (
            <div key={group.title} className="grid gap-1">
              <span className="px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {group.title}
              </span>
              {group.items.map((item) => {
                const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${
                      active
                        ? "bg-primary/15 font-medium text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <Link
            to="/developer/search"
            className="flex min-w-[14rem] flex-1 items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent"
          >
            <Search className="h-4 w-4" />
            Search users, students, markers, cohorts, blocks, events…
          </Link>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary">
              <span className="h-2 w-2 rounded-full bg-primary" /> System online
            </span>
            {alerts ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1.5 text-xs font-semibold text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> {alerts}
              </span>
            ) : null}
            <span className="hidden text-right text-xs leading-tight sm:block">
              <span className="block font-medium">{me?.email}</span>
              <span className="block text-muted-foreground">Developer / Super admin</span>
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6">{children}</main>
        <footer className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          MII / MIU Developer Portal · platform-wide oversight · every action is recorded
        </footer>
      </div>
    </div>
  );
}
