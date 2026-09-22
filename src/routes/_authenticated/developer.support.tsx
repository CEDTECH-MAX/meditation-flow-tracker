import { createFileRoute } from "@tanstack/react-router";
import { SupportSection } from "@/components/developer/sections";

export const Route = createFileRoute("/_authenticated/developer/support")({
  head: () => ({
    meta: [
      { title: "Support view · MII / MIU developer portal" },
      { name: "description", content: "Read-only, time-limited and fully recorded support mode for troubleshooting." },
      { property: "og:title", content: "Support view · MII / MIU developer portal" },
      { property: "og:description", content: "Read-only, time-limited and fully recorded support mode for troubleshooting." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-4">
      <h1 className="font-display text-2xl font-semibold">Support view</h1>
      <SupportSection />
    </div>
  );
}
