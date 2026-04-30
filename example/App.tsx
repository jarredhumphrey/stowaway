import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import '@react-native-async-storage/async-storage'; // ensure Metro bundles the native module
import { ButtonsScreen } from './src/screens/ButtonsScreen';
import { ListScreen } from './src/screens/ListScreen';
import { HorizontalScrollScreen } from './src/screens/HorizontalScrollScreen';
import { FormScreen } from './src/screens/FormScreen';
import { NetworkScreen } from './src/screens/NetworkScreen';

type TabId = 'buttons' | 'lists' | 'scroll' | 'form' | 'network';

const TABS: { id: TabId; label: string }[] = [
  { id: 'buttons', label: 'Buttons' },
  { id: 'lists', label: 'Lists' },
  { id: 'scroll', label: 'Scroll' },
  { id: 'form', label: 'Form' },
  { id: 'network', label: 'Network' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('buttons');

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.screen} testID={`screen-${activeTab}`}>
        {activeTab === 'buttons' && <ButtonsScreen />}
        {activeTab === 'lists' && <ListScreen />}
        {activeTab === 'scroll' && <HorizontalScrollScreen />}
        {activeTab === 'form' && <FormScreen />}
        {activeTab === 'network' && <NetworkScreen />}
      </View>

      <View style={styles.tabBar} testID="tab-bar">
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              testID={`tab-${tab.id}`}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setActiveTab(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  screen: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#c6c6c8',
    backgroundColor: '#f9f9f9',
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabActive: { borderTopWidth: 2, borderTopColor: '#007AFF' },
  tabText: { fontSize: 12, color: '#8e8e93' },
  tabTextActive: { color: '#007AFF', fontWeight: '600' },
});
