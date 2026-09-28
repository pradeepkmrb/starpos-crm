import { monthKey, monthRange, quoteTotals } from "@starpos-crm/shared";
import {
  canMoveQuotation,
  formatQuoteNumber,
  parseBusinessProfile,
  stageImpliedByQuotation,
  whatsappShareLink,
} from "./sales-rules";

describe("quoteTotals", () => {
  it("matches the mockup: ₹23,500 less ₹2,000 at 18% GST is ₹25,370", () => {
    const t = quoteTotals(
      [
        { quantity: 1, unitPricePaise: 1_000_000, taxPercent: 18 },
        { quantity: 1, unitPricePaise: 250_000, taxPercent: 18 },
        { quantity: 1, unitPricePaise: 800_000, taxPercent: 18 },
        { quantity: 1, unitPricePaise: 300_000, taxPercent: 18 },
      ],
      200_000,
    );
    expect(t.subtotalPaise).toBe(2_350_000);
    expect(t.discountPaise).toBe(200_000);
    expect(t.taxPaise).toBe(387_000);
    expect(t.totalPaise).toBe(2_537_000);
    expect(t.taxByRate).toEqual([{ taxPercent: 18, taxablePaise: 2_150_000, taxPaise: 387_000 }]);
  });

  it("taxes each line at its own rate after spreading the discount", () => {
    const t = quoteTotals(
      [
        { quantity: 2, unitPricePaise: 50_000, taxPercent: 18 }, // 1,000
        { quantity: 1, unitPricePaise: 100_000, taxPercent: 5 }, // 1,000
      ],
      20_000, // ₹200 off, ₹100 per line
    );
    expect(t.subtotalPaise).toBe(200_000);
    expect(t.taxByRate).toEqual([
      { taxPercent: 5, taxablePaise: 90_000, taxPaise: 4_500 },
      { taxPercent: 18, taxablePaise: 90_000, taxPaise: 16_200 },
    ]);
    expect(t.totalPaise).toBe(180_000 + 20_700);
  });

  it("spreads an uneven discount without losing a paisa", () => {
    const t = quoteTotals(
      [
        { quantity: 1, unitPricePaise: 333, taxPercent: 0 },
        { quantity: 1, unitPricePaise: 333, taxPercent: 0 },
        { quantity: 1, unitPricePaise: 334, taxPercent: 0 },
      ],
      100,
    );
    expect(t.totalPaise).toBe(900);
  });

  it("caps the discount at the subtotal and ignores negatives", () => {
    expect(quoteTotals([{ quantity: 1, unitPricePaise: 1000, taxPercent: 18 }], 5000).totalPaise).toBe(0);
    expect(quoteTotals([{ quantity: 1, unitPricePaise: 1000, taxPercent: 0 }], -50).totalPaise).toBe(1000);
  });

  it("handles an empty quote", () => {
    expect(quoteTotals([]).totalPaise).toBe(0);
  });
});

describe("month helpers", () => {
  it("finds IST month boundaries", () => {
    const r = monthRange("2026-09", "Asia/Kolkata");
    expect(r.start.toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(r.end.toISOString()).toBe("2026-09-30T18:30:00.000Z");
  });

  it("rolls December into the next year", () => {
    expect(monthRange("2026-12", "Asia/Kolkata").end.toISOString()).toBe("2026-12-31T18:30:00.000Z");
  });

  it("follows daylight saving", () => {
    const r = monthRange("2026-03", "America/New_York");
    expect(r.start.toISOString()).toBe("2026-03-01T05:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-04-01T04:00:00.000Z");
  });

  it("puts a late-evening UTC moment in the next IST month", () => {
    expect(monthKey(new Date("2026-08-31T19:00:00Z"), "Asia/Kolkata")).toBe("2026-09");
  });
});

describe("stageImpliedByQuotation", () => {
  it("moves a lead to proposal when a quote is sent", () => {
    expect(stageImpliedByQuotation("interested", "sent")).toBe("proposal");
  });

  it("wins the lead when a quote is accepted", () => {
    expect(stageImpliedByQuotation("proposal", "accepted")).toBe("won");
  });

  it("never moves backwards or touches closed leads", () => {
    expect(stageImpliedByQuotation("proposal", "sent")).toBeNull();
    expect(stageImpliedByQuotation("lost", "accepted")).toBeNull();
    expect(stageImpliedByQuotation("interested", "rejected")).toBeNull();
  });
});

describe("canMoveQuotation", () => {
  it("lets a draft go out or be accepted on the spot", () => {
    expect(canMoveQuotation("draft", "sent")).toBe(true);
    expect(canMoveQuotation("draft", "accepted")).toBe(true);
    expect(canMoveQuotation("draft", "rejected")).toBe(false);
  });

  it("never goes back to draft", () => {
    expect(canMoveQuotation("sent", "draft")).toBe(false);
  });

  it("lets an answer be revised", () => {
    expect(canMoveQuotation("rejected", "accepted")).toBe(true);
    expect(canMoveQuotation("sent", "rejected")).toBe(true);
  });
});

describe("helpers", () => {
  it("numbers quotes", () => {
    expect(formatQuoteNumber(1001)).toBe("QT-1001");
  });

  it("keeps only known, non-empty business profile fields", () => {
    expect(parseBusinessProfile({ legalName: " Touch4Bill ", gstin: "", validityDays: 15, extra: 1 })).toEqual({
      legalName: "Touch4Bill",
      address: undefined,
      gstin: undefined,
      phone: undefined,
      email: undefined,
      terms: undefined,
      validityDays: 15,
    });
    expect(parseBusinessProfile(null)).toEqual({});
  });

  it("builds a click-to-chat link with the message encoded", () => {
    expect(whatsappShareLink("919876543210", "Quote QT-1001: https://x/y")).toBe(
      "https://wa.me/919876543210?text=Quote%20QT-1001%3A%20https%3A%2F%2Fx%2Fy",
    );
  });
});
