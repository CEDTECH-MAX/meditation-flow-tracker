import { describe, expect, it } from "vitest";
import { displayedMeditationPoints } from "../src/lib/attendance";

describe("meditation marking defaults", () => {
  it.each([null, undefined])("shows zero for an unmarked session (%s)", (record) => {
    expect(displayedMeditationPoints(record)).toBe(0);
  });

  it.each([0, 0.5, 1, 1.5, 2])("keeps an existing %s point mark unchanged", (points) => {
    expect(displayedMeditationPoints({ points })).toBe(points);
  });
});
