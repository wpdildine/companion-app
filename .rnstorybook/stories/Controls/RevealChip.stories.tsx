import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';
import { fn } from 'storybook/test';
import { RevealChip } from '../../../src/app/ui/components/controls';

const meta = {
  title: 'Controls/RevealChip',
  component: RevealChip,
  decorators: [
    (Story) => (
      <View style={{ flex: 1, padding: 16, backgroundColor: '#0a0612' }}>
        <Story />
      </View>
    ),
  ],
  args: { onPress: fn() },
} satisfies Meta<typeof RevealChip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Answer: Story = {
  args: { label: 'Reveal Answer', surface: 'product' },
};

export const Cards: Story = {
  args: { label: 'Reveal Cards', surface: 'product' },
};
