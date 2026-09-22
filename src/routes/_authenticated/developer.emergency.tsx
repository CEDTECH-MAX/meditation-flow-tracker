import { createFileRoute } from "@tanstack/react-router";
import { EmergencySection } from "@/components/developer/sections";

export const Route = createFileRoute("/_authenticated/developer/emergency")({
  head: () => ({
    meta: [
      { title: "Emergency controls · MII / MIU developer portal" },
      { name: "description", content: "Maintenance mode, pause marking and pause sign-ins, with strong confirmation." },
      { property: "og:title", content: "Emergency controls · MII / MIU developer portal" },
      { property: "og:description", content: "Maintenance mode, pause marking and pause sign-ins, with strong confirmation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-4">
      <h1 className="font-display text-2xl font-semibold">Emergency controls</h1>
      <EmergencySection />
    </div>
  );
}
