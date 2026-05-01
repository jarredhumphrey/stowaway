import React, { useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type AsyncState = 'idle' | 'loading' | 'done';

const ACTION_BUTTONS = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'] as const;

function SwipeCard({ onReset }: { onReset: () => void }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [dismissed, setDismissed] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        translateX.extractOffset();
      },
      onPanResponderMove: (_evt, gs) => {
        translateX.setValue(gs.dx);
      },
      onPanResponderRelease: (_evt, gs) => {
        translateX.flattenOffset();
        if (gs.dx < -80) {
          Animated.timing(translateX, { toValue: -400, duration: 200, useNativeDriver: true }).start(() => setDismissed(true));
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  if (dismissed) {
    return (
      <View style={swipeStyles.dismissed}>
        <Text testID="swipe-dismissed" style={swipeStyles.dismissedText}>Card dismissed!</Text>
        <TouchableOpacity onPress={() => { translateX.setValue(0); setDismissed(false); onReset(); }}>
          <Text style={swipeStyles.resetText}>Restore</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View testID="swipe-card" {...panResponder.panHandlers}>
      <Animated.View style={[swipeStyles.card, { transform: [{ translateX }] }]}>
        <Text style={swipeStyles.cardText}>Swipe me left to dismiss</Text>
      </Animated.View>
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  card: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 10,
    alignItems: 'center',
  },
  cardText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  dismissed: { alignItems: 'center', marginBottom: 10, gap: 6 },
  dismissedText: { fontSize: 15, color: '#34C759', fontWeight: '600' },
  resetText: { fontSize: 13, color: '#007AFF' },
});

export function ButtonsScreen() {
  const [count, setCount] = useState(0);
  const [swipeKey, setSwipeKey] = useState(0);
  // swipeKey increments to force-remount SwipeCard after reset
  const [asyncState, setAsyncState] = useState<AsyncState>('idle');
  const [longPressVisible, setLongPressVisible] = useState(false);
  const [timedVisible, setTimedVisible] = useState(false);

  async function runAsync() {
    setAsyncState('loading');
    await new Promise<void>(r => setTimeout(r, 1_500));
    setAsyncState('done');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Buttons</Text>

      {/* ── Counter ─────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>Counter</Text>
      <Text testID="counter-value" style={styles.counterValue}>{count}</Text>
      <View style={styles.row}>
        <TouchableOpacity
          testID="btn-decrement"
          style={[styles.btn, styles.secondary, styles.flex]}
          onPress={() => setCount(c => c - 1)}
        >
          <Text style={styles.secondaryText}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="btn-increment"
          accessibilityLabel="Increment counter"
          style={[styles.btn, styles.flex]}
          onPress={() => setCount(c => c + 1)}
        >
          <Text style={styles.btnText}>+</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        testID="btn-reset"
        style={[styles.btn, styles.danger]}
        onPress={() => setCount(0)}
      >
        <Text style={styles.btnText}>Reset to 0</Text>
      </TouchableOpacity>

      {/* ── States ──────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>States</Text>
      <TouchableOpacity testID="btn-enabled" style={styles.btn} onPress={() => {}}>
        <Text style={styles.btnText}>Enabled</Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="btn-disabled"
        style={[styles.btn, styles.disabledBg]}
        disabled
        accessibilityState={{ disabled: true }}
      >
        <Text style={[styles.btnText, styles.disabledText]}>Disabled</Text>
      </TouchableOpacity>

      {/* ── Async ───────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>Async Action</Text>
      <TouchableOpacity
        testID="btn-async"
        style={[styles.btn, asyncState === 'loading' && styles.disabledBg]}
        onPress={runAsync}
        disabled={asyncState === 'loading'}
      >
        {asyncState === 'loading'
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.btnText}>Run Async (1.5 s)</Text>}
      </TouchableOpacity>
      {asyncState === 'done' && (
        <Text testID="async-result" style={styles.result}>Done!</Text>
      )}
      {asyncState !== 'idle' && (
        <TouchableOpacity
          testID="btn-async-reset"
          style={[styles.btn, styles.secondary]}
          onPress={() => setAsyncState('idle')}
        >
          <Text style={styles.secondaryText}>Reset</Text>
        </TouchableOpacity>
      )}

      {/* ── Long Press ──────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>Long Press</Text>
      <TouchableOpacity
        testID="btn-long-press"
        style={[styles.btn, styles.secondary]}
        onLongPress={() => {
          setLongPressVisible(true);
          setTimeout(() => setLongPressVisible(false), 2_000);
        }}
        delayLongPress={400}
      >
        <Text style={styles.secondaryText}>Hold Me (400 ms)</Text>
      </TouchableOpacity>
      {longPressVisible && (
        <Text testID="long-press-result" style={styles.result}>Long pressed!</Text>
      )}

      {/* ── Show / Hide ─────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>Show / Hide</Text>
      <TouchableOpacity
        testID="btn-show-hide"
        style={styles.btn}
        onPress={() => {
          setTimedVisible(true);
          setTimeout(() => setTimedVisible(false), 2_000);
        }}
      >
        <Text style={styles.btnText}>Show for 2 s</Text>
      </TouchableOpacity>
      {timedVisible && (
        <Text testID="timed-element" style={styles.result}>I will disappear!</Text>
      )}

      {/* ── Swipe ───────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>Swipe Gesture</Text>
      <SwipeCard key={swipeKey} onReset={() => setSwipeKey(k => k + 1)} />

      {/* ── Action list ─────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>Actions</Text>
      <View testID="action-list">
        {ACTION_BUTTONS.map(name => (
          <TouchableOpacity
            key={name}
            testID={`btn-action-${name.toLowerCase()}`}
            style={styles.btn}
            onPress={() => {}}
          >
            <Text style={styles.btnText}>{name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 24 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e8e93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 8,
  },
  counterValue: { fontSize: 56, fontWeight: '200', textAlign: 'center', marginBottom: 16 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  flex: { flex: 1 },
  btn: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#007AFF' },
  secondaryText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  danger: { backgroundColor: '#FF3B30' },
  disabledBg: { backgroundColor: '#c7c7cc' },
  disabledText: { color: '#fff' },
  result: { fontSize: 16, color: '#34C759', fontWeight: '600', textAlign: 'center', marginBottom: 10 },
});
