import type { Meta, StoryObj } from '@storybook/react-native';
import { View, StyleSheet } from 'react-native';
import { fn } from 'storybook/test';
import { RevealChip } from '../../../src/app/ui/components/controls';

function RevealChipRow({
  onRevealAnswer,
  onRevealCards,
  onRevealRules,
  onRevealSources,
}: {
  onRevealAnswer: () => void;
  onRevealCards: () => void;
  onRevealRules: () => void;
  onRevealSources: () => void;
}) {
  return (
    <View style={styles.dock}>
      <RevealChip label="Reveal Answer" onPress={onRevealAnswer} surface="product" />
      <RevealChip label="Reveal Cards" onPress={onRevealCards} surface="product" />
      <RevealChip label="Reveal Rules" onPress={onRevealRules} surface="product" />
      <RevealChip label="Reveal Sources" onPress={onRevealSources} surface="product" />
    </View>
  );
}

const meta = {
  title: 'Controls/Compositions/Reveal chip row',
  component: RevealChipRow,
  decorators: [
    (Story) => (
      <View style={{ flex: 1, padding: 16, backgroundColor: '#0a0612' }}>
        <Story />
      </View>
    ),
  ],
  args: {
    onRevealAnswer: fn(),
    onRevealCards: fn(),
    onRevealRules: fn(),
    onRevealSources: fn(),
  },
} satisfies Meta<typeof RevealChipRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AnswerCardsRulesSources: Story = {};

const styles = StyleSheet.create({
  dock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
