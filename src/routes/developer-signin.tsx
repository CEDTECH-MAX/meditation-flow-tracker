import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/developer-signin")({
  beforeLoad: () => { throw redirect({ to: "/", replace: true }); },
  head: () => ({
    meta: [
      { title: "Developer Account Access · Maharishi Invincibility" },
      { name: "description", content: "Maharishi Invincibility developer account access through the shared sign-in portal." },
      { property: "og:title", content: "Maharishi Invincibility · Developer Account Access" },
      { property: "og:description", content: "Continue to the shared Maharishi Invincibility sign-in portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
