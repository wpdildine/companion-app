/**
 * Selected rules: CR sections/snippets used in the answer. Trust builder.
 * Stable excerpt text; decon only in container and section headers.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { DeconPanel, type DeconPanelIntensity } from './DeconPanel';

export type SelectedRule = {
  id: string;
  title: string;
  excerpt: string;
  used?: boolean;
  why?: string;
  /** Backward-compatible alias. */
  whySelected?: string;
};

export type SelectedRulesBlockProps = {
  rules: SelectedRule[];
  intensity?: DeconPanelIntensity;
  reduceMotion?: boolean;
  onRulePress?: (ruleId: string) => void;
  onRect?: (rect: { x: number; y: number; w: number; h: number }) => void;
  dismissible?: boolean;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
  ink?: string;
  mutedInk?: string;
  panelFill?: string;
  panelStroke?: string;
  accentIntrusionA?: string;
  warn?: string;
  // Legacy aliases for current call sites.
  textColor?: string;
  mutedColor?: string;
};

const UNIT = 8;

export function SelectedRulesBlock({
  rules,
  intensity = 'subtle',
  reduceMotion = false,
  onRulePress,
  onRect,
  dismissible = false,
  onDismiss,
  style,
  ink,
  mutedInk,
  panelFill,
  panelStroke,
  accentIntrusionA,
  warn,
  textColor,
  mutedColor,
}: SelectedRulesBlockProps) {
  if (rules.length === 0) return null;
  const primaryText = ink ?? textColor ?? '#e5e5e5';
  const secondaryText = mutedInk ?? mutedColor ?? '#9a9aa2';

  return (
    <DeconPanel
      title="Selected Rules"
      variant="rules"
      intensity={intensity}
      reduceMotion={reduceMotion}
      headerDecon
      onRect={onRect}
      dismissible={dismissible}
      onDismiss={onDismiss}
      style={style}
      ink={primaryText}
      mutedInk={secondaryText}
      panelFill={panelFill}
      panelStroke={panelStroke}
      accentIntrusionA={accentIntrusionA}
      warn={warn}
    >
      <View style={styles.list}>
        {rules.map((rule, idx) => {
          const why = rule.why ?? rule.whySelected ?? '';
          return (
            <Pressable
              key={rule.id}
              onPress={() => onRulePress?.(rule.id)}
              style={styles.ruleItem}
            >
              <View style={styles.ruleHeader}>
                <View style={styles.ruleIdPill}>
                  <Text style={[styles.ruleId, { color: secondaryText }]}>
                    {rule.id}
                  </Text>
                </View>
                <View style={styles.ruleMain}>
                  {rule.title ? (
                    <Text style={[styles.ruleTitle, { color: primaryText }]} numberOfLines={1}>
                      {rule.title}
                    </Text>
                  ) : null}
                </View>
                {rule.used ? (
                  <View style={styles.usedChip}>
                    <Text style={[styles.usedTag, { color: secondaryText }]}>USED</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.excerpt, { color: primaryText }]} numberOfLines={6}>
                {rule.excerpt}
              </Text>
              {why.length > 0 ? (
                <View style={styles.whyChip}>
                  <Text style={[styles.whyChipText, { color: secondaryText }]} numberOfLines={1}>
                    {why}
                  </Text>
                </View>
              ) : null}
              {idx < rules.length - 1 ? <View style={styles.divider} /> : null}
            </Pressable>
          );
        })}
      </View>
    </DeconPanel>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: UNIT + 2,
  },
  ruleItem: {
    padding: UNIT + 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  ruleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: UNIT,
    marginBottom: UNIT,
  },
  ruleIdPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ruleMain: {
    flex: 1,
  },
  ruleTitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  ruleId: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  usedChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  usedTag: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  excerpt: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  whyChip: {
    alignSelf: 'flex-start',
    marginTop: UNIT,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  whyChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  divider: {
    marginTop: UNIT + 2,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
});
