import { describe, expect, it } from "vitest";
import { loginDestination } from "../src/lib/login-destination";

describe("one account-aware login", () => {
  it.each(["MII", "MIU"])("routes %s students to their attendance portal", (institution) => {
    expect(loginDestination(["student"], institution)).toBe("/dashboard");
  });
  it.each(["MII", "MIU"])("routes %s administrators to administration", (institution) => {
    expect(loginDestination(["admin", "student"], institution)).toBe("/admin");
  });
  it.each(["MII", "MIU"])("routes %s markers to assigned-cohort marking", (institution) => {
    expect(loginDestination(["marker", "student"], institution)).toBe("/marker");
  });
  it("routes developers to oversight even without an institution", () => {
    expect(loginDestination(["developer", "admin", "marker"], null)).toBe("/developer");
  });
  it("routes directory staff to their inbox", () => {
    expect(loginDestination(["staff"], "MIU")).toBe("/mail");
  });
  it("preserves existing head-of-meditation account access", () => {
    expect(loginDestination(["head_of_meditation"], "MII")).toBe("/dashboard");
  });
  it("does not default an unassigned account to MII", () => {
    expect(() => loginDestination(["student"], null)).toThrow("no institution assigned");
  });
  it("does not treat an unknown role as a student", () => {
    expect(() => loginDestination([], "MII")).toThrow("no portal assigned");
  });
});