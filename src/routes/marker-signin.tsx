import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/marker-signin")({
  beforeLoad: () => { throw redirect({ to: "/", replace: true }); },
  head: () => ({
    meta: [
      { title: "Marker Account Access · Maharishi Invincibility" },
      { name: "description", content: "Maharishi Invincibility marker account access through the shared sign-in portal." },
      { property: "og:title", content: "Maharishi Invincibility · Marker Account Access" },
      { property: "og:description", content: "Continue to the shared Maharishi Invincibility sign-in portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
