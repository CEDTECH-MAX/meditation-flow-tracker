import { afterEach, describe, expect, it, vi } from "vitest";
import { reportLovableError } from "./lovable-error-reporting";

function stubWindow() {
  const captureException = vi.fn();
  const reportRuntimeError = vi.fn();
  vi.stubGlobal("window", {
    location: { pathname: "/dashboard" },
    __lovableEvents: { captureException },
    __lovableReportRuntimeError: reportRuntimeError,
  });
  return { captureException, reportRuntimeError };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reportLovableError", () => {
  it("does nothing on the server", () => {
    vi.stubGlobal("window", undefined);
    expect(() => reportLovableError(new Error("boom"))).not.toThrow();
  });

  it("reports the error to the editor telemetry with route context", () => {
    const { captureException } = stubWindow();
    const error = new Error("boom");
    reportLovableError(error, { extra: 1 });
    expect(captureException).toHaveBeenCalledWith(
      error,
      { source: "react_error_boundary", route: "/dashboard", extra: 1 },
      { mechanism: "react_error_boundary", handled: false, severity: "error" },
    );
  });

  it("lets the caller override the source", () => {
    const { captureException } = stubWindow();
    reportLovableError(new Error("boom"), { source: "router" });
    expect(captureException.mock.calls[0]?.[1]).toMatchObject({ source: "router" });
  });

  it("forwards the message and stack of an Error", () => {
    const { reportRuntimeError } = stubWindow();
    const error = Object.assign(new Error("boom"), { stack: "stack-trace" });
    reportLovableError(error);
    expect(reportRuntimeError).toHaveBeenCalledWith({
      message: "boom",
      stack: "stack-trace",
      filename: "/dashboard",
    });
  });

  it("describes a thrown Response by status and url", () => {
    const { reportRuntimeError } = stubWindow();
    reportLovableError(new Response(null, { status: 404 }));
    expect(reportRuntimeError.mock.calls[0]?.[0]).toMatchObject({ message: "Response 404" });
  });

  it("stringifies anything else and omits the stack", () => {
    const { reportRuntimeError } = stubWindow();
    reportLovableError("just a string");
    expect(reportRuntimeError).toHaveBeenCalledWith({
      message: "just a string",
      filename: "/dashboard",
    });
  });

  it("tolerates a preview without the lovable hooks", () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    expect(() => reportLovableError(new Error("boom"))).not.toThrow();
  });
});
