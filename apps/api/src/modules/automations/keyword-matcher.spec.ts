import { matchesKeyword } from "./keyword-matcher";

describe("matchesKeyword", () => {
  describe("contains mode", () => {
    const config = { keywords: ["price"], matchType: "contains" as const };

    it("matches a keyword inside a sentence", () => {
      expect(matchesKeyword(config, "what is the price?")).toBe(true);
    });

    it("is case insensitive", () => {
      expect(matchesKeyword(config, "PRICE")).toBe(true);
    });

    it("ignores surrounding punctuation", () => {
      expect(matchesKeyword(config, "Price!!!")).toBe(true);
    });

    it("does not match on a substring of a longer word", () => {
      expect(matchesKeyword({ keywords: ["hi"], matchType: "contains" }, "this is fine")).toBe(false);
    });

    it("matches a standalone short word", () => {
      expect(matchesKeyword({ keywords: ["hi"], matchType: "contains" }, "hi there")).toBe(true);
    });

    it("matches multi-word keywords via substring", () => {
      expect(
        matchesKeyword({ keywords: ["price list"], matchType: "contains" }, "send me the price list please"),
      ).toBe(true);
    });

    it("matches keywords in scripts that do not use spaces", () => {
      expect(matchesKeyword({ keywords: ["价格"], matchType: "contains" }, "请问价格是多少")).toBe(true);
    });
  });

  describe("exact mode", () => {
    const config = { keywords: ["price"], matchType: "exact" as const };

    it("matches the whole message", () => {
      expect(matchesKeyword(config, "price")).toBe(true);
    });

    it("rejects a message containing more than the keyword", () => {
      expect(matchesKeyword(config, "what is the price?")).toBe(false);
    });
  });

  describe("empty input", () => {
    it("returns false for an empty message", () => {
      expect(matchesKeyword({ keywords: ["price"] }, "")).toBe(false);
    });

    it("returns false when no keywords are configured", () => {
      expect(matchesKeyword({ keywords: [] }, "price")).toBe(false);
    });

    it("returns false for an empty config", () => {
      expect(matchesKeyword({}, "price")).toBe(false);
    });
  });
});
