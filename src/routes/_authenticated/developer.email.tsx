import { createFileRoute } from "@tanstack/react-router";
import { EmailSection } from "@/components/developer/sections";

export const Route = createFileRoute("/_authenticated/developer/email")({
  head: () => ({
    meta: [
      { title: "Email centre · MII / MIU developer portal" },
      { name: "description", content: "Sent, delivered, failed, bounced and pending notification emails." },
      { property: "og:title", content: "Email centre · MII / MIU developer portal" },
      { property: "og:description", content: "Sent, delivered, failed, bounced and pending notification emails." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-4">
      <h1 className="font-display text-2xl font-semibold">Email centre</h1>
      <EmailSection />
    </div>
  );
}
