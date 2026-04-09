/**
 * Finalization-only: trims human-short trailing rule appendix from text committed to
 * responseText / TTS. Structured validation rules are unchanged (handled separately).
 */

import { extractQuotedInnerForHumanShort } from '@atlas/runtime';

function normalizeNewlines(s: string): string {
  return (s ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Line that is only a single double-quoted span (straight or curly), non-empty inner. */
function isAppendixRuleQuoteLine(line: string): boolean {
  const q = line.replace(/\u201c/g, '"').replace(/\u201d/g, '"').trim();
  return /^\s*"[^"\n]+"\s*$/.test(q);
}

/**
 * When {@link extractQuotedInnerForHumanShort} detects human-short shape, drop the first
 * standalone quoted line (line 2+) and everything after it — typical `ruling\\n"CR excerpt"`.
 */
export function stripHumanShortInlineRuleQuoteForCommit(text: string): string {
  const raw = text ?? '';
  if (extractQuotedInnerForHumanShort(raw) == null) return raw;

  const t = normalizeNewlines(raw)
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const lines = t.split('\n').map(ln => ln.trim()).filter(ln => ln.length > 0);

  let cut = -1;
  for (let i = 1; i < lines.length; i++) {
    if (isAppendixRuleQuoteLine(lines[i]!)) {
      cut = i;
      break;
    }
  }
  if (cut < 0) return raw;

  const head = lines.slice(0, cut).join('\n').trim();
  return head.length > 0 ? head : raw;
}
