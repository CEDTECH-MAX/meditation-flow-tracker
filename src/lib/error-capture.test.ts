import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeLastCapturedError, describeError } from "./error-capture";

// Importing the module replaces console.error with its capturing wrapper; hold
// on to that wrapper so the tests exercise it instead of a later spy.
const captureError = console.error;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // drain anything a previous test recorded through console.error
  consumeLastCapturedError();
});

describe("describeError", () => {
  it("keeps the stack of a plain error", () => {
    const error = new Error("kaboom");
    const described = describeError(error);
    expect(described).toContain("kaboom");
    expect(described).toContain("error-capture.test");
  });

  it("falls back to name and message when there is no stack", () => {
    const error = new Error("no stack");
    delete (error as { stack?: string }).stack;
    expect(describeError(error)).toBe("Error: no stack");
  });

  it("appends a numeric status or statusCode", () => {
    const withStatus = Object.assign(new Error("nope"), { status: 403, stack: undefined });
    expect(describeError(withStatus)).toBe("Error: nope (status 403)");

    const withStatusCode = Object.assign(new Error("nope"), { statusCode: 500, stack: undefined });
    expect(describeError(withStatusCode)).toBe("Error: nope (status 500)");
  });

  it("ignores a non-numeric status", () => {
    const error = Object.assign(new Error("nope"), { status: "403", stack: undefined });
    expect(describeError(error)).toBe("Error: nope");
  });

  it("walks the cause chain", () => {
    const root = Object.assign(new Error("root"), { stack: undefined });
    const middle = Object.assign(new Error("middle"), { stack: undefined, cause: root });
    const top = Object.assign(new Error("top"), { stack: undefined, cause: middle });
    expect(describeError(top)).toBe(
      ["Error: top", "caused by: Error: middle", "caused by: Error: root"].join("\n"),
    );
  });

  it("stops after five levels of cause", () => {
    let error = Object.assign(new Error("level-0"), { stack: undefined });
    for (let i = 1; i < 8; i += 1) {
      error = Object.assign(new Error(`level-${i}`), { stack: undefined, cause: error });
    }
    const lines = describeError(error).split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe("Error: level-7");
    expect(lines[4]).toBe("caused by: Error: level-3");
  });

  it("serializes non-error values", () => {
    expect(describeError("just a string")).toBe("just a string");
    expect(describeError({ a: 1 })).toBe('{"a":1}');
    expect(describeError(7)).toBe("7");
  });

  it("survives values that cannot be serialized", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    expect(describeError(circular)).toBe("[object Object]");
    expect(describeError(undefined)).toBe("");
    expect(describeError(null)).toBe("");
  });

  it("truncates very long descriptions", () => {
    const error = Object.assign(new Error("x".repeat(20_000)), { stack: undefined });
    expect(describeError(error)).toHaveLength(8_000);
  });

  it("appends the cause of a non-error at the end of the chain", () => {
    const error = Object.assign(new Error("top"), { stack: undefined, cause: "a string cause" });
    expect(describeError(error)).toBe("Error: top\na string cause");
  });
});

describe("consumeLastCapturedError", () => {
  beforeEach(() => {
    // the wrapper forwards to the real logger; keep the test output quiet
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  it("returns undefined when nothing was captured", () => {
    expect(consumeLastCapturedError()).toBeUndefined();
  });

  it("captures errors passed to console.error", () => {
    const error = new Error("logged");
    captureError(error);
    expect(consumeLastCapturedError()).toBe(error);
  });

  it("expands errors before handing them to the underlying logger", async () => {
    // Re-import against a stubbed console so the wrapper installed at import
    // time forwards to a logger this test can inspect.
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void logged.push(args);
    vi.resetModules();
    try {
      const fresh = await import("./error-capture");
      const wrapper = console.error;
      wrapper("context", Object.assign(new Error("logged"), { stack: undefined }), { plain: true });
      expect(logged).toEqual([["context", "Error: logged", { plain: true }]]);
      expect(fresh.consumeLastCapturedError()).toBeInstanceOf(Error);
    } finally {
      console.error = original;
      vi.resetModules();
    }
  });

  it("only returns the error once", () => {
    captureError(new Error("logged"));
    expect(consumeLastCapturedError()).toBeInstanceOf(Error);
    expect(consumeLastCapturedError()).toBeUndefined();
  });

  it("keeps only the most recent error", () => {
    const first = new Error("first");
    const second = new Error("second");
    captureError(first);
    captureError(second);
    expect(consumeLastCapturedError()).toBe(second);
  });

  it("ignores non-error arguments", () => {
    captureError("plain message", { not: "an error" });
    expect(consumeLastCapturedError()).toBeUndefined();
  });

  it("discards an error older than the five second window", () => {
    vi.useFakeTimers().setSystemTime(new Date("2025-01-01T00:00:00Z"));
    captureError(new Error("stale"));
    vi.advanceTimersByTime(5_001);
    expect(consumeLastCapturedError()).toBeUndefined();
  });

  it("still returns an error inside the window", () => {
    vi.useFakeTimers().setSystemTime(new Date("2025-01-01T00:00:00Z"));
    captureError(new Error("fresh"));
    vi.advanceTimersByTime(4_000);
    expect(consumeLastCapturedError()).toBeInstanceOf(Error);
  });
});
