import { visibleLeadsWhere, visibleViaLead } from "./lead-visibility";

describe("visibleLeadsWhere", () => {
  it("limits an own-scope role to the person's own and unassigned leads", () => {
    expect(visibleLeadsWhere({ dataScope: "own", userId: "u1" })).toEqual({
      OR: [{ ownerUserId: "u1" }, { ownerUserId: null }],
    });
    expect(visibleViaLead({ dataScope: "own", userId: "u1" })).toEqual({
      lead: { OR: [{ ownerUserId: "u1" }, { ownerUserId: null }] },
    });
  });

  it("lets an all-scope role see every lead", () => {
    expect(visibleLeadsWhere({ dataScope: "all", userId: "u1" })).toEqual({});
    expect(visibleViaLead({ dataScope: "all", userId: "u1" })).toEqual({});
  });

  it("doesn't restrict a call with no user (API key, public form)", () => {
    expect(visibleLeadsWhere({ dataScope: "own", userId: "" })).toEqual({});
  });
});
