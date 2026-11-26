import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/mii")({
  beforeLoad: () => { throw redirect({ to: "/", replace: true }); },
  head: () => ({
    meta: [
      { title: "Institute Account Access · Maharishi Invincibility" },
      { name: "description", content: "Maharishi Invincibility institute account access through the shared sign-in portal." },
      { property: "og:title", content: "Maharishi Invincibility · Institute Account Access" },
      { property: "og:description", content: "Continue to the shared Maharishi Invincibility sign-in portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
