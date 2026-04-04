/**
 * Deterministic speech-only transform for TTS: strip rule-number noise from committed
 * answer text without changing UI / structured payloads. No model, no paraphrase.
 */

const RULE_ID = /\b\d{3}\.\d+[a-z]?(?:#seg\d+)?\b/gi;

function hadNumericRuleReference(original: string): boolean {
  RULE_ID.lastIndex = 0;
  return RULE_ID.test(original);
}

/**
 * Produces text safe for Piper: fewer rule-id tokens, optional attachment line when
 * the committed answer cited CR-style rule ids.
 */
export function toSpeechText(input: string): string {
  const original = input;
  const attachAnchor = hadNumericRuleReference(original);

  let s = original;

  // Remove numeric rule citations (e.g. 603.3b, 117.3a#seg1)
  s = s.replace(RULE_ID, '');

  // Remove boilerplate phrases that cite rules (after ids stripped so '.' in ids does not break)
  s = s.replace(/\b(?:see|under|per)\s+rules?\b[^.!?\n]*[.!?]?/gi, '');
  s = s.replace(/\b(?:under|per)\s+rule\b[^.!?\n]*[.!?]?/gi, '');

  // Cleanup leftover list glue and punctuation
  s = s.replace(/,\s*,/g, ',');
  s = s.replace(/\band\s*,/gi, ',');
  s = s.replace(/,\s*\./g, '.');
  s = s.replace(/\s*\.\s*\./g, '.');
  s = s.replace(/\s+and\s*\./gi, '.');
  s = s.replace(/\s+\./g, '.');
  s = s.replace(/\s{2,}/g, ' ');
  s = s.replace(/,{2,}/g, ',');
  s = s.replace(/\s+,/g, ',');
  s = s.replace(/\s*,\s*/g, ', ');
  s = s.replace(/\s{2,}/g, ' ');
  s = s.trim();
  s = s.replace(/^[\s,]+|[\s,]+$/g, '');
  s = s.trim();
  if (/^[\s,]*$/.test(s)) {
    s = '';
  }

  if (attachAnchor) {
    if (s.length === 0) {
      return "I've attached the relevant rules.";
    }
    return `${s} I've attached the relevant rules.`;
  }

  return s;
}
