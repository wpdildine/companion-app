/**
 * Orchestrator-authored copy for runtime-gated outcomes (no model).
 * Keys align with runtime `FailureIntent` — see runtime-ts SEMANTIC_FRONT_DOOR.md.
 */

import type { FailureIntent } from '@atlas/runtime';

export const RESTATES_REQUEST_RESPONSES: readonly string[] = [
  'That came through like a potato mic—try again?',
  'I heard… something. Wanna run that back?',
  'Congrats, you invented a new sentence. Try again?',
  'That was almost English—give me one more pass.',
  'My brain did a 404 on that. Retry?',
  'You cut out like bad WiFi—say it again?',
  'I’m gonna pretend I didn’t hear that. Go again.',
  'That sentence tripped over itself—try again?',
  'Even I’m confused, and that’s saying something.',
  'You speedran that—slow it down and try again.',
  'That sounded like autocorrect gave up—retry?',
  'I caught vibes, not meaning. Try again.',
  'Close …  but also not at all. Go again?',
  'That input needs a patch—run it back.',
  'You almost had it—one more try.',
  'I think your words are buffering—say it again?',
  'That glitched mid-flight—retry?',
  'I heard syllables, not intent. Again?',
  'That one slipped through the cracks—go again.',
  'Try that again, but with meaning this time.',
  'I’m gonna need a director’s cut of that.',
  'That didn’t survive transmission—retry?',
  'We lost the plot halfway through—again?',
  'That felt like a beta sentence—ship v2?',
  'I believe in you. Try again.',
  'That wasn’t it. Run it back.',
  'That sentence needs QA—again?',
  'Almost coherent—give me another take.',
  'You zigged when you meant to zag—retry?',
  'Let’s pretend that didn’t happen. Again?',
];

export const AMBIGUOUS_ENTITY_RESPONSES: readonly string[] = [
  'I see multiple options—pick one.',
  'You gave me choices. I need a decision.',
  'Which one are we talking about, exactly?',
  'That could mean a few things—narrow it down.',
  'You’re being mysterious. Clarify?',
  'I’ve got options—what’s the target?',
  'Pick your fighter.',
  'I need a specific—what do you mean?',
  'That’s ambiguous—choose one.',
  'You’re making me guess—help me out.',
  'Which one did you mean? Don’t be shy.',
  'Multiple matches detected—select one.',
  'That’s a fork in the road—where are we going?',
  'I need a name, not vibes.',
  'You gave me a category, not an answer.',
  'Be specific—what exactly?',
  'That’s a bit too broad—zoom in.',
  'You’re keeping it vague—tighten it up.',
  'I can’t read your mind (yet). Clarify?',
  'Which one are we locking in?',
  'That’s a choose-your-own-adventure—pick a page.',
  'Ambiguous detected—resolve it for me.',
  'You’re hedging—commit to one.',
  'That could go a few ways—guide me.',
  'I need a target, not a cloud.',
  'Which entity are we talking about?',
  'Too many possibilities—trim it down.',
  'That’s not specific enough—try again.',
  'Give me the exact one.',
  'Help me help you—clarify.',
];

/** Scripted copy when runtime requests repair confirmation (AO turnstile only). */
export const REPAIR_REQUEST_RESPONSES: readonly string[] = [
  'I can run a cleaned-up version of that—want to use it?',
  'I have a clearer phrasing—should I run with that?',
  'Want me to search using this fixed version instead?',
  'I can retry with a repaired query—go ahead?',
  'Use the repaired wording I suggest?',
];

/** Optional short line after user rejects the proposed repair. */
export const REPAIR_REJECT_RESPONSES: readonly string[] = [
  'Okay—say what you meant whenever you’re ready.',
  'No problem. Ask again when you want.',
  'Got it. Try a new question when you like.',
];

export const INSUFFICIENT_CONTEXT_RESPONSES: readonly string[] = [
  'I need a little more to work with.',
  'That’s not enough context—try again with more detail.',
  'You’re giving me crumbs—I need the whole snack.',
  'I’m missing pieces here—fill it in?',
  'That’s a bit too thin—add more detail.',
  'Give me more to latch onto.',
  'That’s not quite enough—expand it.',
  'I need a bit more context to answer that.',
  'You’re close—just add more detail.',
  'That’s under-specified—try again.',
  'I can’t quite land that—give me more info.',
  'Add a little more detail and I’ve got you.',
  'That’s a teaser, not a question—expand it.',
  'I need more signal, less mystery.',
  'That’s not enough to go on—try again.',
  'You’re halfway there—finish the thought.',
  'That’s a skeleton—add some meat.',
  'I need more than that to help.',
  'Give me a bit more detail and we’re good.',
  'That’s too vague—be more specific.',
  'I need more context before I can answer.',
  'You’re almost there—just add detail.',
  'That’s a rough sketch—fill it in.',
  'I need more pieces of the puzzle.',
  'That’s not enough for a solid answer.',
  'Give me more context and I’ll take it from there.',
  'That’s a bit too light—expand it.',
  'I need more info to work with.',
  'That’s not quite complete—try again.',
  'Add more detail and we’re in business.',
];

export function scriptedResponsesForFailureIntent(
  fi: FailureIntent,
): readonly string[] {
  switch (fi) {
    case 'restate_request':
      return RESTATES_REQUEST_RESPONSES;
    case 'ambiguous_entity':
      return AMBIGUOUS_ENTITY_RESPONSES;
    case 'insufficient_context':
      return INSUFFICIENT_CONTEXT_RESPONSES;
    default: {
      const _exhaustive: never = fi;
      return _exhaustive;
    }
  }
}

export function pickRandomResponse(list: readonly string[]): string {
  if (list.length === 0) {
    return '';
  }
  const i = Math.floor(Math.random() * list.length);
  return list[i] ?? list[0]!;
}
