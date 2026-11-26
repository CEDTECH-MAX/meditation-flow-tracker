/** Navigation only: existing protected functions and RLS still enforce access. */
export function loginDestination(roles: readonly string[], institution: unknown) {
  if (roles.includes("developer")) return "/developer" as const;
  if (institution !== "MII" && institution !== "MIU") {
    throw new Error("Your account has no institution assigned. Please contact your administrator.");
  }
  if (roles.includes("admin")) return "/admin" as const;
  if (roles.includes("marker")) return "/marker" as const;
  if (roles.includes("staff")) return "/mail" as const;
  if (roles.includes("student") || roles.includes("head_of_meditation")) return "/dashboard" as const;
  throw new Error("Your account has no portal assigned. Please contact your administrator.");
}