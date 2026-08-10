import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("px-2", "text-sm")).toBe("px-2 text-sm");
  });

  it("drops falsy values", () => {
    expect(cn("px-2", false, null, undefined, "")).toBe("px-2");
  });

  it("supports conditional objects and arrays", () => {
    expect(cn(["px-2", { "text-sm": true, hidden: false }])).toBe("px-2 text-sm");
  });

  it("lets the last conflicting tailwind class win", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-success", "text-destructive")).toBe("text-destructive");
  });

  it("returns an empty string with no input", () => {
    expect(cn()).toBe("");
  });
});
