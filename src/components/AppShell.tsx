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
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:block">
              {me?.profile?.full_name || me?.email}
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
        <nav className="mx-auto max-w-6xl overflow-x-auto px-4 pb-2">
          <div className="flex gap-1">
            {(admin ? adminNav : studentNav).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact ?? false }}
                className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-accent data-[status=active]:bg-primary data-[status=active]:text-primary-foreground"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2 text-center text-xs text-muted-foreground">
        Minimum requirement: 80% attendance per meditation block.
      </footer>
    </div>
  );
}
