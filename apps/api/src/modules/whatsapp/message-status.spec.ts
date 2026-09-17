import { describeStatusError, shouldApplyStatus } from "./message-status";

describe("shouldApplyStatus", () => {
  it("advances sent → delivered → read", () => {
    expect(shouldApplyStatus("sent", "delivered")).toBe(true);
    expect(shouldApplyStatus("delivered", "read")).toBe(true);
    expect(shouldApplyStatus("sent", "read")).toBe(true);
  });

  it("does not demote on out-of-order webhooks", () => {
    expect(shouldApplyStatus("read", "delivered")).toBe(false);
    expect(shouldApplyStatus("delivered", "sent")).toBe(false);
  });

  it("lets a late failure replace sent or delivered, but not read", () => {
    expect(shouldApplyStatus("sent", "failed")).toBe(true);
    expect(shouldApplyStatus("delivered", "failed")).toBe(true);
    expect(shouldApplyStatus("read", "failed")).toBe(false);
  });

  it("treats failed as terminal", () => {
    expect(shouldApplyStatus("failed", "delivered")).toBe(false);
  });

  it("ignores repeats and unknown statuses", () => {
    expect(shouldApplyStatus("delivered", "delivered")).toBe(false);
    expect(shouldApplyStatus("sent", "deleted")).toBe(false);
  });
});

describe("describeStatusError", () => {
  const base = { id: "wamid.1", status: "failed" as const, timestamp: "0", recipient_id: "91" };

  it("prefers error_data.details and prefixes the code", () => {
    expect(
      describeStatusError({
        ...base,
        errors: [{ code: 131026, title: "Message undeliverable", error_data: { details: "Receiver is incapable" } }],
      }),
    ).toBe("(#131026) Receiver is incapable");
  });

  it("falls back to the title", () => {
    expect(describeStatusError({ ...base, errors: [{ code: 131049, title: "Ecosystem limit" }] })).toBe(
      "(#131049) Ecosystem limit",
    );
  });

  it("returns null when Meta sent no error", () => {
    expect(describeStatusError(base)).toBeNull();
  });
});
