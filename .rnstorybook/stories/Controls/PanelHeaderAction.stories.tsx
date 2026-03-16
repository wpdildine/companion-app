import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';
import { fn } from 'storybook/test';
import { PanelHeaderAction } from '../../../src/app/ui/components/controls';

const meta = {
  title: 'Controls/PanelHeaderAction',
  component: PanelHeaderAction,
  decorators: [
    (Story) => (
      <View style={{ flex: 1, padding: 16, backgroundColor: 'rgba(15,17,21,0.95)' }}>
        <Story />
      </View>
    ),
  ],
  args: { onPress: fn() },
} satisfies Meta<typeof PanelHeaderAction>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Close: Story = {
  args: { variant: 'close', surface: 'debug' },
};

export const Dismiss: Story = {
  args: { variant: 'dismiss', surface: 'product' },
};

export const CustomLabel: Story = {
  args: { variant: 'action', label: 'Done', surface: 'debug' },
};
