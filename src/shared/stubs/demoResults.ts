/**
 * Stub data for debug/demo results overlay (answer text, card refs, selected rules).
 * Used when DEBUG_SCENARIO or debug stubs are enabled in AgentSurface.
 */

export const dummyAnswer = `
Blood Moon turns all nonbasic lands into Mountains.
This removes their abilities unless those abilities are intrinsic to being a Mountain.
Continuous effects are applied in layer 4 and layer 6 depending on the interaction.
`;

/** CardRef-shaped stubs for overlay demo. */
export const dummyCards = [
  {
    id: 'blood-moon',
    name: 'Blood Moon',
    imageUri: undefined as string | undefined,
    typeLine: 'Enchantment',
    manaCost: '{2}{R}',
    oracle: 'Nonbasic lands are Mountains.',
  },
  {
    id: 'urborg',
    name: 'Urborg, Tomb of Yawgmoth',
    imageUri: undefined as string | undefined,
    typeLine: 'Legendary Land',
    manaCost: '',
    oracle: 'Each land is a Swamp in addition to its other land types.',
  },
];

/** SelectedRule-shaped stubs for overlay demo. */
export const dummyRules = [
  {
    id: '613.1',
    title: 'Layer System',
    excerpt:
      'The values of objects are determined by applying continuous effects in a series of layers.',
    used: true,
  },
  {
    id: '305.7',
    title: 'Land Type Changing Effects',
    excerpt:
      "If an effect sets a land's subtype to one or more basic land types, the land loses all abilities and gains the corresponding mana abilities.",
    used: true,
  },
  {
    id: '604.1',
    title: 'Static Abilities',
    excerpt:
      'Static abilities do something all the time rather than being activated or triggered.',
    used: false,
  },
];
