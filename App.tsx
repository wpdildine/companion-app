/**
 * CompanionApp
 * @format
 */

import 'llama.rn';
import {
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

const DEPENDENCIES = [
  { name: 'react', version: '19.2.3' },
  { name: 'react-native', version: '0.84.0' },
  { name: 'react-native-safe-area-context', version: '^5.5.2' },
  { name: 'llama.rn', version: '^0.11.0' },
] as const;

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <SpecificationsScreen />
    </SafeAreaProvider>
  );
}

function SpecificationsScreen() {
  const insets = useSafeAreaInsets();
  const isDarkMode = useColorScheme() === 'dark';
  const textColor = isDarkMode ? '#e5e5e5' : '#1a1a1a';
  const mutedColor = isDarkMode ? '#888' : '#666';
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Text style={[styles.title, { color: textColor }]}>Specifications</Text>
      <View style={[styles.section, { borderBottomColor: borderColor }]}>
        <Text style={[styles.sectionTitle, { color: mutedColor }]}>Dependencies</Text>
        {DEPENDENCIES.map((dep) => (
          <View key={dep.name} style={styles.row}>
            <Text style={styles.checkmark}>✓</Text>
            <Text style={[styles.depName, { color: textColor }]}>{dep.name}</Text>
            <Text style={[styles.depVersion, { color: mutedColor }]}>{dep.version}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 24,
  },
  section: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  checkmark: {
    fontSize: 16,
    color: '#22c55e',
    fontWeight: '600',
  },
  depName: {
    fontSize: 16,
    flex: 1,
  },
  depVersion: {
    fontSize: 14,
  },
});

export default App;
