import { coexistenceMessageText, historyDirection, historyStatus, metaTimestampToDate } from "./coexistence";

describe("coexistence helpers", () => {
  it("uses the text body, or the type for non-text messages", () => {
    expect(coexistenceMessageText({ id: "1", from: "1", type: "text", text: { body: "Hi" } })).toBe("Hi");
    expect(coexistenceMessageText({ id: "1", from: "1", type: "image" })).toBe("[image]");
  });

  it("treats messages from the thread's number as inbound", () => {
    expect(historyDirection("16505551234", { id: "1", from: "16505551234" })).toBe("inbound");
    expect(historyDirection("16505551234", { id: "1", from: "15550783881" })).toBe("outbound");
  });

  it("maps history statuses to MessageLog statuses", () => {
    expect(historyStatus("inbound", "READ")).toBe("received");
    expect(historyStatus("outbound", "READ")).toBe("read");
    expect(historyStatus("outbound", "DELIVERED")).toBe("delivered");
    expect(historyStatus("outbound", "PENDING")).toBe("sent");
    expect(historyStatus("outbound")).toBe("sent");
  });

  it("converts unix-second timestamps", () => {
    expect(metaTimestampToDate("1739230955").toISOString()).toBe("2025-02-10T23:42:35.000Z");
    expect(metaTimestampToDate("nope")).toBeInstanceOf(Date);
  });
});
