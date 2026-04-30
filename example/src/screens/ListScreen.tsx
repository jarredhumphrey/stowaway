import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Item = { id: string; title: string; detail: string };

const ITEMS: Item[] = Array.from({ length: 60 }, (_, i) => ({
  id: String(i),
  title: `Item ${i + 1}`,
  detail: `Subtitle for item ${i + 1}`,
}));

export function ListScreen() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Vertical List</Text>
        {selected !== null && (
          <Text testID="list-selected-label" style={styles.badge}>
            Selected: Item {Number(selected) + 1}
          </Text>
        )}
      </View>

      <FlatList
        testID="vertical-list"
        data={ITEMS}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`list-item-${item.id}`}
            style={[styles.item, selected === item.id && styles.itemSelected]}
            onPress={() => setSelected(item.id)}
          >
            <Text testID={`list-item-title-${item.id}`} style={styles.itemTitle}>
              {item.title}
            </Text>
            <Text style={styles.itemDetail}>{item.detail}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    padding: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#c6c6c8',
  },
  title: { fontSize: 28, fontWeight: '700' },
  badge: { marginTop: 6, fontSize: 13, color: '#007AFF', fontWeight: '500' },
  list: { paddingHorizontal: 16 },
  item: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5ea',
  },
  itemSelected: { backgroundColor: '#EBF3FF' },
  itemTitle: { fontSize: 16, fontWeight: '500' },
  itemDetail: { fontSize: 13, color: '#8e8e93', marginTop: 2 },
});
