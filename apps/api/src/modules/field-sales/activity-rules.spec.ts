import {
  checkInDecision,
  closedAtForStatusChange,
  completedAtForStatus,
  stageImpliedByActivity,
} from "./activity-rules";

describe("closedAtForStatusChange", () => {
  const now = new Date("2026-09-18T10:00:00Z");

  it("stamps the close date when a lead is won or lost", () => {
    expect(closedAtForStatusChange("proposal", "won", now)).toBe(now);
    expect(closedAtForStatusChange("new", "lost", now)).toBe(now);
  });

  it("clears it when a closed lead is reopened", () => {
    expect(closedAtForStatusChange("lost", "interested", now)).toBeNull();
  });

  it("leaves it alone otherwise, including won ↔ lost", () => {
    expect(closedAtForStatusChange("new", "contacted", now)).toBeUndefined();
    expect(closedAtForStatusChange("won", "lost", now)).toBeUndefined();
  });
});

describe("stageImpliedByActivity", () => {
  it("marks a new lead contacted after a completed call, visit or demo", () => {
    expect(stageImpliedByActivity("new", { type: "call", status: "completed" })).toBe("contacted");
    expect(stageImpliedByActivity("new", { type: "visit", status: "completed" })).toBe("contacted");
  });

  it("moves a lead to demo scheduled when a demo is booked", () => {
    expect(stageImpliedByActivity("interested", { type: "demo", status: "scheduled" })).toBe("demo_scheduled");
  });

  it("never moves a lead backwards", () => {
    expect(stageImpliedByActivity("proposal", { type: "call", status: "completed" })).toBeNull();
    expect(stageImpliedByActivity("proposal", { type: "demo", status: "scheduled" })).toBeNull();
  });

  it("never touches a closed lead", () => {
    expect(stageImpliedByActivity("lost", { type: "call", status: "completed" })).toBeNull();
  });

  it("ignores notes, follow-ups and scheduled calls", () => {
    expect(stageImpliedByActivity("new", { type: "note", status: "completed" })).toBeNull();
    expect(stageImpliedByActivity("new", { type: "follow_up", status: "completed" })).toBeNull();
    expect(stageImpliedByActivity("new", { type: "call", status: "scheduled" })).toBeNull();
  });
});

describe("completedAtForStatus", () => {
  const now = new Date("2026-09-18T10:00:00Z");

  it("defaults a completion to now", () => {
    expect(completedAtForStatus("completed", undefined, now)).toBe(now);
  });

  it("keeps an explicit completion time", () => {
    const at = new Date("2026-09-17T09:00:00Z");
    expect(completedAtForStatus("completed", at, now)).toBe(at);
  });

  it("clears it for scheduled or cancelled activities", () => {
    expect(completedAtForStatus("scheduled", now, now)).toBeNull();
    expect(completedAtForStatus("cancelled", undefined, now)).toBeNull();
  });
});

describe("checkInDecision", () => {
  // A lead in Koramangala, Bangalore; 0.0009° of latitude is about 100 m.
  const lead = { latitude: 12.9352, longitude: 77.6245 };

  it("allows a check-in inside the radius and reports the distance", () => {
    const d = checkInDecision(lead, { latitude: 12.9361, longitude: 77.6245 });
    expect(d.allowed).toBe(true);
    expect(d.distanceMeters).toBeGreaterThan(95);
    expect(d.distanceMeters).toBeLessThan(105);
  });

  it("refuses a check-in outside the radius", () => {
    const d = checkInDecision(lead, { latitude: 12.9452, longitude: 77.6245 });
    expect(d.allowed).toBe(false);
    expect(d.distanceMeters).toBeGreaterThan(1000);
  });

  it("pins a lead that has no location yet", () => {
    expect(checkInDecision({ latitude: null, longitude: null }, lead)).toEqual({
      allowed: true,
      distanceMeters: null,
      pinLead: true,
    });
  });

  it("honours a custom radius", () => {
    expect(checkInDecision(lead, { latitude: 12.9361, longitude: 77.6245 }, 50).allowed).toBe(false);
  });
});
