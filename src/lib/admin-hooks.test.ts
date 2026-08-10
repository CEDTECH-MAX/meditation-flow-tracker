import { describe, expect, it } from "vitest";
import { pickActive } from "./admin-hooks";
import type { Block } from "@/lib/attendance";

const block = (id: string, status: Block["status"]): Block => ({
  id,
  name: id,
  start_date: "2025-01-06",
  end_date: "2025-01-17",
  weeks: 2,
  meditation_days: 10,
  status,
});

describe("pickActive", () => {
  it("returns null while the blocks are still loading", () => {
    expect(pickActive(undefined)).toBeNull();
  });

  it("returns null when there are no blocks", () => {
    expect(pickActive([])).toBeNull();
  });

  it("prefers the active block wherever it sits in the list", () => {
    const blocks = [
      block("closed", "closed"),
      block("active", "active"),
      block("next", "upcoming"),
    ];
    expect(pickActive(blocks)?.id).toBe("active");
  });

  it("falls back to the first block when none is active", () => {
    expect(pickActive([block("closed", "closed"), block("next", "upcoming")])?.id).toBe("closed");
  });
});
