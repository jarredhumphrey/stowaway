import React, { useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const PALETTE = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5AC8FA', '#FF2D55', '#FFCC00'];

const CARDS = Array.from({ length: 24 }, (_, i) => ({
  id: String(i),
  label: `Card ${i + 1}`,
  color: PALETTE[i % PALETTE.length],
}));

const SECTIONS = Array.from({ length: 10 }, (_, s) => ({
  id: String(s),
  title: `Section ${s + 1}`,
  chips: Array.from({ length: 12 }, (_, c) => ({
    id: `${s}-${c}`,
    label: `${s + 1}.${c + 1}`,
  })),
}));

export function HorizontalScrollScreen() {
  const [activeCard, setActiveCard] = useState<string | null>(null);

  return (
    <ScrollView testID="scroll-vertical" contentContainerStyle={styles.container}>
      <Text style={styles.title}>Scroll</Text>

      {/* ── Horizontal card strip ───────────────────────────────── */}
      <Text style={styles.sectionLabel}>Horizontal Cards</Text>
      <FlatList
        testID="cards-horizontal"
        horizontal
        data={CARDS}
        keyExtractor={item => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardStrip}
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`card-${item.id}`}
            style={[
              styles.card,
              { backgroundColor: item.color },
              activeCard === item.id && styles.cardActive,
            ]}
            onPress={() => setActiveCard(item.id)}
          >
            <Text style={styles.cardLabel}>{item.label}</Text>
          </TouchableOpacity>
        )}
      />
      {activeCard !== null && (
        <Text testID="card-selected-label" style={styles.badge}>
          Selected: Card {Number(activeCard) + 1}
        </Text>
      )}

      {/* ── Sections with horizontal chip rows ─────────────────── */}
      {SECTIONS.map(section => (
        <View key={section.id} style={styles.section} testID={`section-${section.id}`}>
          <Text style={styles.sectionLabel}>{section.title}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {section.chips.map(chip => (
                <TouchableOpacity
                  key={chip.id}
                  testID={`chip-${chip.id}`}
                  style={styles.chip}
                  onPress={() => {}}
                >
                  <Text style={styles.chipText}>{chip.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '700', paddingHorizontal: 16, paddingTop: 16, marginBottom: 20 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e8e93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  cardStrip: { paddingLeft: 16, paddingRight: 6 },
  card: {
    width: 110,
    height: 110,
    borderRadius: 16,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardActive: { opacity: 0.75 },
  cardLabel: { color: '#fff', fontWeight: '700', fontSize: 14 },
  badge: { marginHorizontal: 16, marginTop: 10, fontSize: 13, color: '#007AFF', fontWeight: '500' },
  section: { marginTop: 24 },
  chipRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 4 },
  chip: {
    backgroundColor: '#f2f2f7',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
  },
  chipText: { fontSize: 14, color: '#1c1c1e' },
});
