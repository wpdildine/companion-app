import type { Meta, StoryObj } from '@storybook/react-native';
import { View, Text, StyleSheet } from 'react-native';
import { fn } from 'storybook/test';
import { PanelHeaderAction } from '../../../src/app/ui/components/controls';

const fontMono = { fontFamily: 'Menlo' };

function PanelHeaderComposition({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={[styles.title, fontMono]}>Panel title</Text>
        <PanelHeaderAction variant="close" onPress={onClose} surface="debug" />
      </View>
      <Text style={[styles.body, fontMono]}>Panel body content.</Text>
    </View>
  );
}

const meta = {
  title: 'Controls/Compositions/Panel header',
  component: PanelHeaderComposition,
  decorators: [
    (Story) => (
      <View style={{ flex: 1, padding: 16, backgroundColor: '#1a1a1a' }}>
        <Story />
      </View>
    ),
  ],
  args: { onClose: fn() },
} satisfies Meta<typeof PanelHeaderComposition>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TitleAndClose: Story = {};

const styles = StyleSheet.create({
  panel: {
    backgroundColor: 'rgba(15,17,21,0.9)',
    borderWidth: 1,
    borderColor: '#2a2f38',
    borderRadius: 6,
    padding: 12,
    maxWidth: 320,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  title: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  body: {
    color: '#8b949e',
    fontSize: 12,
  },
});
