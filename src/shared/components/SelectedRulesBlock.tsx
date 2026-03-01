/**
 * Selected rules: CR sections/snippets used in the answer. Trust builder.
 * Stable excerpt text; decon only in container and section headers.
 */

import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { DeconPanel } from './DeconPanel';

export type SelectedRule = {
  id: string;
  title: string;
  excerpt: string;
  used?: boolean;
  whySelected?: string;
};

export type SelectedRulesBlockProps = {
  rules: SelectedRule[];
  style?: ViewStyle;
  textColor?: string;
  mutedColor?: string;
};

const PANEL_BG = 'rgba(255,255,255,0.06)';

export function SelectedRulesBlock({
  rules,
  style,
  textColor = '#e5e5e5',
  mutedColor = '#888',
}: SelectedRulesBlockProps) {
  if (rules.length === 0) return null;

  return (
    <View style={[styles.wrapper, style]}>
      <Text style={[styles.sectionLabel, { color: mutedColor }]}>
        Selected rules
      </Text>
      <DeconPanel backgroundColor={PANEL_BG}>
        <View style={styles.list}>
          {rules.map(rule => (
            <View key={rule.id} style={styles.ruleItem}>
              <View style={styles.ruleHeader}>
                <Text style={[styles.ruleId, { color: mutedColor }]}>
                  {rule.id}
                </Text>
                {rule.used === true && (
                  <Text style={[styles.usedTag, { color: mutedColor }]}>
                    Used in answer
                  </Text>
                )}
              </View>
              <Text style={[styles.excerpt, { color: textColor }]}>
                {rule.excerpt}
              </Text>
              {rule.whySelected != null && rule.whySelected.length > 0 && (
                <Text style={[styles.whyChip, { color: mutedColor }]}>
                  {rule.whySelected}
                </Text>
              )}
            </View>
          ))}
        </View>
      </DeconPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  list: {
    padding: 12,
  },
  ruleItem: {
    marginBottom: 12,
  },
  ruleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  ruleId: {
    fontSize: 12,
    fontWeight: '600',
  },
  usedTag: {
    fontSize: 10,
  },
  excerpt: {
    fontSize: 13,
    lineHeight: 20,
  },
  whyChip: {
    fontSize: 10,
    marginTop: 4,
  },
});
