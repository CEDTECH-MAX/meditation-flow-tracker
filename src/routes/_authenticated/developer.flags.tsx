import { createFileRoute } from "@tanstack/react-router";
import { FlagsSection } from "@/components/developer/sections";

export const Route = createFileRoute("/_authenticated/developer/flags")({
  head: () => ({
    meta: [
      { title: "Feature flags · MII / MIU developer portal" },
      { name: "description", content: "Turn platform features on or off per institution without a code change." },
      { property: "og:title", content: "Feature flags · MII / MIU developer portal" },
      { property: "og:description", content: "Turn platform features on or off per institution without a code change." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-4">
      <h1 className="font-display text-2xl font-semibold">Feature flags</h1>
      <FlagsSection />
    </div>
  );
}
