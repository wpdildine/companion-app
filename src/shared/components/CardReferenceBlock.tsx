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
  type ViewStyle,
} from 'react-native';
import { DeconPanel } from './DeconPanel';

export type CardRef = {
  id: string;
  name: string;
  imageUrl?: string | null;
  typeLine?: string;
  manaCost?: string;
  oracle?: string;
};

export type CardReferenceBlockProps = {
  cards: CardRef[];
  /** Optional container style (e.g. from theme). */
  style?: ViewStyle;
  textColor?: string;
  mutedColor?: string;
};

const PLACEHOLDER_COLOR = 'rgba(255,255,255,0.2)';

export function CardReferenceBlock({
  cards,
  style,
  textColor = '#e5e5e5',
  mutedColor = '#888',
}: CardReferenceBlockProps) {
  if (cards.length === 0) return null;

  return (
    <View style={[styles.wrapper, style]}>
      <Text style={[styles.sectionLabel, { color: mutedColor }]}>
        Card references
      </Text>
      <DeconPanel backgroundColor={PLACEHOLDER_COLOR}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {cards.map(card => (
            <CardRefItem
              key={card.id}
              card={card}
              textColor={textColor}
              mutedColor={mutedColor}
            />
          ))}
        </ScrollView>
      </DeconPanel>
    </View>
  );
}

function CardRefItem({
  card,
  textColor,
  mutedColor,
}: {
  card: CardRef;
  textColor: string;
  mutedColor: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasImage = card.imageUrl != null && card.imageUrl.length > 0;

  return (
    <Pressable
      onPress={() => setExpanded(e => !e)}
      style={styles.cardItem}
    >
      <View style={styles.cardImageWrap}>
        {hasImage ? (
          <Image
            source={{ uri: card.imageUrl! }}
            style={styles.cardImage}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.cardImage, styles.placeholderGlyph]} />
        )}
      </View>
      <Text style={[styles.cardName, { color: textColor }]} numberOfLines={1}>
        {card.name}
      </Text>
      {(card.typeLine != null || card.manaCost != null) && (
        <Text style={[styles.cardMeta, { color: mutedColor }]} numberOfLines={1}>
          {[card.typeLine, card.manaCost].filter(Boolean).join(' · ')}
        </Text>
      )}
      {expanded && card.oracle != null && (
        <Text style={[styles.oracle, { color: mutedColor }]} numberOfLines={6}>
          {card.oracle}
        </Text>
      )}
    </Pressable>
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
  scrollContent: {
    padding: 12,
    gap: 16,
  },
  cardItem: {
    width: 140,
  },
  cardImageWrap: {
    width: 120,
    height: 168,
    marginBottom: 6,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  placeholderGlyph: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardName: {
    fontSize: 13,
    fontWeight: '600',
  },
  cardMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  oracle: {
    fontSize: 11,
    marginTop: 6,
    fontStyle: 'italic',
  },
});
