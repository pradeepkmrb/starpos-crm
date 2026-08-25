export interface KeywordTriggerConfig {
  keywords?: string[];
  matchType?: "contains" | "exact";
}

/**
 * Scripts that don't delimit words with spaces (Chinese, Japanese, Thai,
 * Khmer, Lao, Myanmar). Word-boundary matching is meaningless for these —
 * the whole message tokenizes as one "word" — so they use substring matching.
 */
const SPACELESS_SCRIPT_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Khmer}\p{Script=Lao}\p{Script=Myanmar}]/u;

/**
 * Keywords are stored already lowercased/trimmed (see AutomationsService).
 * "exact" compares the whole normalized message; "contains" matches on word
 * boundaries so "hi" doesn't fire on "this".
 */
export function matchesKeyword(config: KeywordTriggerConfig, messageText: string): boolean {
  const keywords = config.keywords ?? [];
  if (keywords.length === 0) return false;

  const normalized = messageText.trim().toLowerCase();
  if (normalized.length === 0) return false;

  if ((config.matchType ?? "contains") === "exact") {
    return keywords.some((keyword) => normalized === keyword);
  }

  const words = new Set(normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  return keywords.some((keyword) => {
    // Multi-word keywords, and any keyword in a spaceless script, can't be
    // matched against the word set — fall back to substring.
    if (keyword.includes(" ") || SPACELESS_SCRIPT_RE.test(keyword)) {
      return normalized.includes(keyword);
    }
    return words.has(keyword);
  });
}
