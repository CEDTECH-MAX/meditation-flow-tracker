import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui-kit";
import { INSTITUTIONS } from "@/lib/attendance";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Attendance Portals · Maharishi Invincibility MII & MIU" },
      {
        name: "description",
        content:
          "Choose your portal: Maharishi Invincibility Institute (MII) meditation attendance, or Maharishi Invincibility University (MIU) meditation and class attendance.",
      },
      { property: "og:title", content: "Maharishi Invincibility Attendance Portals" },
      {
        property: "og:description",
        content:
          "Two separate portals — MII and MIU — each with its own attendance rules, registers and records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Chooser,
});

function Chooser() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-semibold text-gradient-green sm:text-4xl">
            Attendance Management
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose your institution to sign in. Each institution keeps its own students, blocks and
            attendance rules.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {INSTITUTIONS.map((inst) => (
            <Link key={inst.value} to={inst.path} className="group">
              <Card className="animate-rise h-full transition group-hover:-translate-y-0.5 group-hover:shadow-soft">
                <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary font-display text-base font-bold text-primary-foreground">
                  {inst.short}
                </span>
                <h2 className="font-display text-xl font-semibold">{inst.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{inst.tagline}</p>
                <span className="mt-4 inline-block text-sm font-medium text-primary">
                  Sign in →
                </span>
              </Card>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Minimum requirement: 80% attendance per block. Accounts are created by your administrator.
        </p>
      </div>
    </div>
  );
}
