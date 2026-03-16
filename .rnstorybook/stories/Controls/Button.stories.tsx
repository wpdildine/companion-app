import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';
import { fn } from 'storybook/test';
import { Button } from '../../../src/app/ui/components/controls';

const meta = {
  title: 'Controls/Button',
  component: Button,
  decorators: [
    (Story) => (
      <View style={{ flex: 1, padding: 16, backgroundColor: '#1a1a1a' }}>
        <Story />
      </View>
    ),
  ],
  args: { onPress: fn() },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: 'Action', surface: 'product' },
};

export const Quiet: Story = {
  args: { label: 'Quiet action', variant: 'quiet', surface: 'product' },
};

export const Disabled: Story = {
  args: { label: 'Disabled', disabled: true, surface: 'product' },
};

export const DebugSuccess: Story = {
  args: { label: 'Enable', surface: 'debug', tone: 'success' },
};
