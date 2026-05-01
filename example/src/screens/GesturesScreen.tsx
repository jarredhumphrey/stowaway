import React, { useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

function DoubleTapCounter() {
  const [count, setCount] = useState(0);
  const lastTap = useRef(0);

  function handleTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setCount(c => c + 1);
    }
    lastTap.current = now;
  }

  return (
    <View>
      <TouchableOpacity testID="double-tap-target" style={styles.tapBox} onPress={handleTap}>
        <Text style={styles.tapBoxText}>Double-tap me</Text>
      </TouchableOpacity>
      <Text testID="double-tap-count" style={styles.countText}>{count}</Text>
    </View>
  );
}

type LayoutRect = { x: number; y: number; width: number; height: number };

function DragDropDemo() {
  const [dropped, setDropped] = useState(false);
  const pan = useRef(new Animated.ValueXY()).current;
  const dragItemLayout = useRef<LayoutRect | null>(null);
  const dropZoneLayout = useRef<LayoutRect | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_evt, gs) => {
        pan.flattenOffset();
        const item = dragItemLayout.current;
        const zone = dropZoneLayout.current;
        let inZone: boolean;
        if (item && zone) {
          const cx = item.x + item.width / 2 + gs.dx;
          const cy = item.y + item.height / 2 + gs.dy;
          inZone =
            cx >= zone.x && cx <= zone.x + zone.width &&
            cy >= zone.y && cy <= zone.y + zone.height;
        } else {
          inZone = gs.dy > 50;
        }
        if (inZone) {
          setDropped(true);
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
    }),
  ).current;

  return (
    <View>
      <Animated.View
        testID={dropped ? 'drop-result' : 'drag-item'}
        {...panResponder.panHandlers}
        style={[
          styles.dragItem,
          dropped && styles.dragItemDropped,
          { zIndex: 1, transform: pan.getTranslateTransform() },
        ]}
        onLayout={e => { dragItemLayout.current = e.nativeEvent.layout; }}
      >
        <Text style={styles.dragItemText}>{dropped ? 'Nice drop!' : 'Drag me down'}</Text>
      </Animated.View>
      <View style={styles.spacer} />
      <View
        testID="drop-zone"
        style={styles.dropZone}
        onLayout={e => { dropZoneLayout.current = e.nativeEvent.layout; }}
      >
        <Text style={styles.dropZoneText}>Drop here</Text>
      </View>
    </View>
  );
}

export function GesturesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Gestures</Text>

      <Text style={styles.sectionLabel}>Double Tap</Text>
      <DoubleTapCounter />

      <Text style={styles.sectionLabel}>Drag To</Text>
      <DragDropDemo />
    </View>
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
  tapBox: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 10,
  },
  tapBoxText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  countText: { fontSize: 40, fontWeight: '200', textAlign: 'center', marginBottom: 16 },
  dragItem: {
    backgroundColor: '#FF9F0A',
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: 'center',
  },
  dragItemDropped: {
    backgroundColor: '#34C759',
  },
  dragItemText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  spacer: { height: 120 },
  dropZone: {
    borderWidth: 2,
    borderColor: '#34C759',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: 'center',
  },
  dropZoneText: { fontSize: 16, color: '#34C759', fontWeight: '600' },
});
