import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Menu, X } from "lucide-react";
import { getMe } from "@/lib/data.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui-kit";


export function useMe() {
  const fn = useServerFn(getMe);
  return useQuery({ queryKey: ["me"], queryFn: () => fn(), staleTime: 60_000 });
}

const adminNav: { to: string; label: string; exact?: boolean }[] = [
  { to: "/admin", label: "Overview", exact: true },
  { to: "/admin/attendance", label: "Attendance" },
  { to: "/admin/students", label: "Students" },
  { to: "/admin/cohorts", label: "Cohorts" },
  { to: "/admin/blocks", label: "Blocks" },
  { to: "/admin/reports", label: "Reports" },
];

const studentNav: { to: string; label: string; exact?: boolean }[] = [
  { to: "/dashboard", label: "My attendance", exact: true },
  { to: "/advisor", label: "AI Advisor" },
  { to: "/password", label: "Password" },
];


export function AppShell({
  children,
  admin = false,
}: {
  children: React.ReactNode;
  admin?: boolean;
}) {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = admin ? adminNav : studentNav;

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-border/60 bg-card/70 text-foreground transition hover:bg-accent"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link to={admin ? "/admin" : "/dashboard"} className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                MI
              </span>
              <span className="leading-tight">
                <span className="block text-sm font-semibold">Maharishi Institute</span>
                <span className="block text-[11px] text-muted-foreground">
                  Meditation Attendance{admin ? " · Admin" : ""}
                </span>
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:block">
              {me?.profile?.full_name || me?.email}
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>

        {open ? (
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="fixed inset-0 -z-10 cursor-default bg-foreground/10"
            />
            <nav className="mx-auto max-w-6xl px-4 pb-3">
              <div className="animate-rise glass-muted grid gap-1 rounded-2xl border border-border/60 p-2 sm:max-w-xs">
                {items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: item.exact ?? false }}
                    className="rounded-xl px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent data-[status=active]:bg-primary data-[status=active]:text-primary-foreground"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </nav>
          </>
        ) : null}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2 text-center text-xs text-muted-foreground">
        Minimum requirement: 80% attendance per meditation block.
      </footer>
    </div>
  );
}
