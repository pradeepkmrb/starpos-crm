import { REMINDER_GRACE_MINUTES, REMINDER_LEAD_MINUTES, reminderTitle, reminderWindow } from "./activity-reminders";

const now = new Date("2026-09-27T10:00:00Z");
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

describe("reminderWindow", () => {
  it("reaches ahead by the lead time and back by the grace period", () => {
    const { from, to } = reminderWindow(now);
    expect(to).toEqual(at(REMINDER_LEAD_MINUTES));
    expect(from).toEqual(at(-REMINDER_GRACE_MINUTES));
  });
});

describe("reminderTitle", () => {
  it("counts down to upcoming work", () => {
    expect(reminderTitle("visit", at(12), now)).toBe("Visit in 12 min");
  });

  it("says now when it is due this minute", () => {
    expect(reminderTitle("follow_up", at(0.2), now)).toBe("Follow-up now");
  });

  it("owns up to a late reminder", () => {
    expect(reminderTitle("call", at(-4), now)).toBe("Call was due 4 min ago");
  });
});
