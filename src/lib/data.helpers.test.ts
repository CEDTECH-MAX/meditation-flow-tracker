import { describe, expect, it, vi } from "vitest";
import { assertAdmin, audit, internalEmail, statusFromPoints, type Ctx } from "./data.helpers";

function makeCtx(overrides: {
  rpc?: ReturnType<typeof vi.fn>;
  insert?: ReturnType<typeof vi.fn>;
  claims?: Record<string, unknown>;
}) {
  const insert = overrides.insert ?? vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ insert });
  const ctx = {
    supabase: {
      rpc: overrides.rpc ?? vi.fn().mockResolvedValue({ data: true, error: null }),
      from,
    },
    userId: "user-1",
    claims: overrides.claims ?? { email: "admin@example.com" },
  } as unknown as Ctx;
  return { ctx, from, insert };
}

describe("assertAdmin", () => {
  it("passes the caller through when has_role returns true", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const { ctx } = makeCtx({ rpc });
    await expect(assertAdmin(ctx)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("has_role", { _user_id: "user-1", _role: "admin" });
  });

  it("rejects a non-admin", async () => {
    const { ctx } = makeCtx({ rpc: vi.fn().mockResolvedValue({ data: false, error: null }) });
    await expect(assertAdmin(ctx)).rejects.toThrow("Forbidden: administrators only");
  });

  it("rejects when the role lookup errors", async () => {
    const { ctx } = makeCtx({
      rpc: vi.fn().mockResolvedValue({ data: true, error: { message: "boom" } }),
    });
    await expect(assertAdmin(ctx)).rejects.toThrow("Forbidden: administrators only");
  });
});

describe("audit", () => {
  it("writes an audit row with the actor taken from the claims", async () => {
    const { ctx, from, insert } = makeCtx({});
    await audit(ctx, "update", "block", "block-1", { status: "closed" });
    expect(from).toHaveBeenCalledWith("audit_logs");
    expect(insert).toHaveBeenCalledWith({
      actor_id: "user-1",
      actor_email: "admin@example.com",
      action: "update",
      entity: "block",
      entity_id: "block-1",
      details: { status: "closed" },
    });
  });

  it("stores a null actor email when the claim is missing", async () => {
    const { ctx, insert } = makeCtx({ claims: {} });
    await audit(ctx, "delete", "student", null, {});
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ actor_email: null, entity_id: null }),
    );
  });
});

describe("internalEmail", () => {
  it("slugifies the student number", () => {
    expect(internalEmail("MI-2025/001")).toBe("mi.2025.001@mi.local");
  });

  it("trims surrounding whitespace and separators", () => {
    expect(internalEmail("  ABC 123  ")).toBe("abc.123@mi.local");
    expect(internalEmail("--abc--")).toBe("abc@mi.local");
  });

  it("falls back to a generic inbox when nothing usable remains", () => {
    expect(internalEmail("   ")).toBe("student@mi.local");
    expect(internalEmail("///")).toBe("student@mi.local");
  });
});

describe("statusFromPoints", () => {
  it("is present for any positive score", () => {
    expect(statusFromPoints(2)).toBe("present");
    expect(statusFromPoints(0.5, "unexcused")).toBe("present");
  });

  it("is excused only for sick or approved leave", () => {
    expect(statusFromPoints(0, "sick_leave")).toBe("excused");
    expect(statusFromPoints(0, "approved_leave")).toBe("excused");
  });

  it("is absent for zero points without an excusing reason", () => {
    expect(statusFromPoints(0)).toBe("absent");
    expect(statusFromPoints(0, null)).toBe("absent");
    expect(statusFromPoints(0, "late_arrival")).toBe("absent");
    expect(statusFromPoints(0, "other")).toBe("absent");
  });
});
