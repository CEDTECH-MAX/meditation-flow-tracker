import { createFileRoute } from "@tanstack/react-router";
import { AuditSection } from "@/components/developer/sections";

export const Route = createFileRoute("/_authenticated/developer/audit")({
  head: () => ({
    meta: [
      { title: "Audit log · MII / MIU developer portal" },
      { name: "description", content: "Complete platform audit history with who acted, when, and on what." },
      { property: "og:title", content: "Audit log · MII / MIU developer portal" },
      { property: "og:description", content: "Complete platform audit history with who acted, when, and on what." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-4">
      <h1 className="font-display text-2xl font-semibold">Audit log</h1>
      <AuditSection />
    </div>
  );
}
