/**
 * Oracle text extraction and card-effect answer formatting for the sanitizer path.
 *
 * These helpers are used by `maybeSanitizeCardEffectAnswer` in index.ts when a
 * "what does X do?" query resolves to exactly one card.
 */

import { normalizeOracleText } from './normalizeOracleText';

/**
 * Extract the full oracle text block for `cardName` from a canonicalized context bundle.
 *
 * The bundle format (from getContextRN) is:
 *   [Card: Name]\n<oracle lines>\n\n[Next section]
 *
 * Sections are separated by exactly \n\n after canonicalization. This function
 * captures everything from after the card header to the next section boundary (or
 * end of string), preserving internal line breaks so formatCardEffectAnswer can
 * produce output from the full ability set.
 */
export function extractCardOracleText(
  contextText: string | undefined,
  cardName: string,
): string | null {
  if (!contextText?.trim()) return null;
  const escapedName = cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Capture everything after the header up to the next blank-line section boundary or EOS.
  // [\s\S]+? is lazy so it stops at the first \n\n.
  const match = contextText.match(
    new RegExp(`\\[Card: ${escapedName}\\]\\n([\\s\\S]+?)(?=\\n\\n|$)`, 'i'),
  );
  return match?.[1]?.trim() ?? null;
}

/**
 * Returns true for a line that is a bare keyword ability:
 * no colon (activation cost marker), no period (end of sentence), and ≤ 3 words.
 *
 * Examples that pass:  "Flying", "Trample", "First strike", "Double strike"
 * Examples that fail:  "Tap: Add mana.", "When this enters, draw a card."
 */
function isKeywordLine(line: string): boolean {
  return !/[.:]/.test(line) && line.split(/\s+/).length <= 3;
}

/**
 * Format a (possibly multiline) oracle text block into a human-readable sentence
 * suitable for a user-facing "what does X do?" answer.
 *
 * Single-line oracle: preserves existing `are`/`is` patterns and the `Card: text.` fallback.
 * Multiline oracle: separates bare keyword lines from ability lines, then:
 *   - keywords only   → "CardName has flying and trample."
 *   - keywords + abilities → "CardName has flying and Tap: Add one mana of any color."
 *   - abilities only  → "CardName: Tap: Do X. Tap: Do Y."
 *
 * MTG brace notation is normalized before any formatting step.
 */
function prependCardNameSafely(cardName: string, text: string): string {
  const trimmedName = cardName.trim();
  const normalizedName = trimmedName.toLowerCase();

  const normalizedForPrefixCheck = text
    .trim()
    .replace(/^["“]/, '')
    .toLowerCase();

  const startsWithName =
    normalizedForPrefixCheck.startsWith(normalizedName + ' ') ||
    normalizedForPrefixCheck.startsWith(normalizedName + ':') ||
    normalizedForPrefixCheck.startsWith(normalizedName + '—') ||
    normalizedForPrefixCheck.startsWith(normalizedName + '-');

  if (startsWithName) {
    return /[.!?]["”']?$/.test(text) ? text : `${text}.`;
  }

  return `${cardName}: ${text}.`;
}

export function formatCardEffectAnswer(cardName: string, oracleText: string): string {
  // Normalize brace notation on the full block before splitting (preserves line structure).
  const symbolsNormalized = normalizeOracleText(oracleText.trim());
  const lines = symbolsNormalized
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return `${cardName}.`;

  if (lines.length === 1) {
    // Single-line path: preserve existing behavior.
    const cleaned = lines[0]!.replace(/\.+$/, '');
    const areMatch = cleaned.match(/^(.+?) are (.+)$/i);
    if (areMatch) {
      const subject = areMatch[1]?.trim().toLowerCase();
      const predicate = areMatch[2]?.trim();
      if (subject && predicate) return `${cardName} turns ${subject} into ${predicate}.`;
    }
    const isMatch = cleaned.match(/^(.+?) is (.+)$/i);
    if (isMatch) {
      const subject = isMatch[1]?.trim().toLowerCase();
      const predicate = isMatch[2]?.trim();
      if (subject && predicate) return `${cardName} makes ${subject} ${predicate}.`;
    }
    return prependCardNameSafely(cardName, cleaned);
  }

  // Multiline path.
  const keywords = lines
    .filter(isKeywordLine)
    .map(l => l.replace(/\.+$/, '').trim().toLowerCase());

  const abilityLines = lines
    .filter(l => !isKeywordLine(l))
    .map(l => l.replace(/\.+$/, '').trim());

  if (keywords.length > 0 && abilityLines.length === 0) {
    // Pure keyword card (e.g. "Flying\nTrample\nHaste").
    return `${cardName} has ${keywords.join(' and ')}.`;
  }
  if (keywords.length > 0) {
    // Mixed: keywords followed by activated / triggered / static abilities.
    return `${cardName} has ${keywords.join(' and ')} and ${abilityLines.join(' and ')}.`;
  }
  // Abilities only: join with ". " to preserve sentence structure.
  return prependCardNameSafely(cardName, abilityLines.join('. '));
}
