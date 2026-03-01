/**
 * Card references: image + name/type/mana. Local cache only; placeholder if missing.
 * Decon accents on header/label only. Tap to expand oracle (optional).
 */

import React, { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { DeconPanel, type DeconPanelIntensity } from './DeconPanel';

export type CardRef = {
  id: string;
  name: string;
  imageUri?: string | null;
  /** Backward-compatible alias. */
  imageUrl?: string | null;
  typeLine?: string;
  manaCost?: string;
  oracle?: string;
};

export type CardReferenceBlockProps = {
  cards: CardRef[];
  layout?: 'strip' | 'stack';
  intensity?: DeconPanelIntensity;
  reduceMotion?: boolean;
  onCardPress?: (cardId: string) => void;
  onRect?: (rect: { x: number; y: number; w: number; h: number }) => void;
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
const TILE_WIDTH = 176;
/** Real card size 63 × 88 mm; use for placeholder when image is missing. */
const CARD_ASPECT_RATIO = 63 / 88;

export function CardReferenceBlock({
  cards,
  layout = 'strip',
  intensity = 'subtle',
  reduceMotion = false,
  onCardPress,
  onRect,
  style,
  ink,
  mutedInk,
  panelFill,
  panelStroke,
  accentIntrusionA,
  warn,
  textColor,
  mutedColor,
}: CardReferenceBlockProps) {
  if (cards.length === 0) return null;
  const primaryText = ink ?? textColor ?? '#e5e5e5';
  const secondaryText = mutedInk ?? mutedColor ?? '#9a9aa2';

  return (
    <DeconPanel
      title="Cards Referenced"
      variant="cards"
      intensity={intensity}
      reduceMotion={reduceMotion}
      headerDecon
      onRect={onRect}
      style={style}
      ink={primaryText}
      mutedInk={secondaryText}
      panelFill={panelFill}
      panelStroke={panelStroke}
      accentIntrusionA={accentIntrusionA}
      warn={warn}
    >
      {layout === 'stack' ? (
        <View style={styles.stackList}>
          {cards.map(card => (
            <CardRefItem
              key={card.id}
              card={card}
              compact={false}
              textColor={primaryText}
              mutedColor={secondaryText}
              onPress={onCardPress}
            />
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stripContent}
        >
          {cards.map(card => (
            <CardRefItem
              key={card.id}
              card={card}
              compact
              textColor={primaryText}
              mutedColor={secondaryText}
              onPress={onCardPress}
            />
          ))}
        </ScrollView>
      )}
    </DeconPanel>
  );
}

function CardRefItem({
  card,
  compact,
  textColor,
  mutedColor,
  onPress,
}: {
  card: CardRef;
  compact: boolean;
  textColor: string;
  mutedColor: string;
  onPress?: (cardId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const imageUri = card.imageUri ?? card.imageUrl ?? null;
  const hasLocalImage = !!imageUri && !/^https?:\/\//i.test(imageUri);
  const initial = card.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <Pressable
      onPress={() => {
        onPress?.(card.id);
        if (card.oracle) setExpanded(e => !e);
      }}
      style={[styles.cardItem, compact ? styles.cardItemCompact : styles.cardItemStack]}
    >
      <View style={styles.referencedTag}>
        <Text style={[styles.referencedTagText, { color: mutedColor }]}>Referenced</Text>
      </View>
      <View style={[styles.cardImageWrap, !compact && styles.cardImageWrapStack]}>
        {hasLocalImage ? (
          <Image
            source={{ uri: imageUri! }}
            style={styles.cardImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.cardImage, styles.placeholderGlyph]}>
            <View style={styles.placeholderShape} />
            <Text style={[styles.placeholderInitial, { color: mutedColor }]}>
              {initial}
            </Text>
          </View>
        )}
      </View>
      <View style={[styles.textBlock, !compact && styles.textBlockStack]}>
        <View style={styles.nameRow}>
          <Text style={[styles.cardName, { color: textColor }]} numberOfLines={1}>
            {card.name}
          </Text>
          {card.manaCost ? (
            <Text style={[styles.cardMeta, { color: mutedColor }]}>{card.manaCost}</Text>
          ) : null}
        </View>
        {card.typeLine ? (
          <Text style={[styles.cardMeta, { color: mutedColor }]} numberOfLines={1}>
            {card.typeLine}
          </Text>
        ) : null}
        {expanded && card.oracle != null ? (
          <Text style={[styles.oracle, { color: textColor }]} numberOfLines={6}>
            {card.oracle}
          </Text>
        ) : null}
      </View>
      {card.oracle ? (
        <Text style={[styles.expandHint, { color: mutedColor }]}>
          {expanded ? 'Hide oracle' : 'Show oracle'}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stripContent: {
    paddingVertical: 4,
    gap: UNIT + 4,
  },
  stackList: {
    gap: UNIT + 2,
  },
  cardItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    padding: UNIT + 4,
    gap: UNIT,
  },
  cardItemCompact: {
    width: TILE_WIDTH,
  },
  cardItemStack: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardImage: {
    width: '100%',
    aspectRatio: CARD_ASPECT_RATIO,
    borderRadius: 10,
  },
  placeholderGlyph: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderShape: {
    width: 36,
    height: 36 / CARD_ASPECT_RATIO,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    marginBottom: 8,
  },
  placeholderInitial: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  cardImageWrap: {
    width: '100%',
  },
  cardImageWrapStack: {
    width: 84,
    flexShrink: 0,
  },
  textBlock: {
    gap: 4,
  },
  textBlockStack: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: UNIT,
  },
  cardName: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    flex: 1,
  },
  cardMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  oracle: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  expandHint: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    marginTop: 2,
  },
  referencedTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  referencedTagText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
});
