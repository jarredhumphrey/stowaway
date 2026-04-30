// Self-contained IIFE evaluated inside the Hermes engine via Runtime.evaluate.
// Installs global.__testBridge__ with methods for fiber-tree interaction.
// IMPORTANT: this string must be valid JS (no TS), and must return a truthy value.
export const BRIDGE_INJECTOR_SCRIPT = `
(function () {
  var hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook) return false;

  // Registry maps integer nodeId -> fiber reference
  var registry = [];

  function register(fiber) {
    registry.push(fiber);
    return registry.length - 1;
  }

  function getRoots() {
    var roots = [];
    hook.renderers.forEach(function (renderer, rendererId) {
      var fiberRoots = hook.getFiberRoots(rendererId);
      fiberRoots.forEach(function (root) {
        roots.push(root.current);
      });
    });
    return roots;
  }

  // Walk the fiber tree via child/sibling links (never return, to avoid cycles).
  function walk(fiber, visitor) {
    if (!fiber) return;
    visitor(fiber);
    walk(fiber.child, visitor);
    walk(fiber.sibling, visitor);
  }

  function findByTestID(testID) {
    var found = null;
    var roots = getRoots();
    for (var i = 0; i < roots.length; i++) {
      walk(roots[i], function (fiber) {
        if (found) return;
        if (fiber.memoizedProps && fiber.memoizedProps.testID === testID) {
          found = fiber;
        }
      });
      if (found) break;
    }
    if (!found) return null;
    var nodeId = register(found);
    var name = typeof found.type === 'string'
      ? found.type
      : (found.type && (found.type.displayName || found.type.name)) || 'Unknown';
    return { nodeId: nodeId, componentType: name, testID: testID };
  }

  function findByComponent(name, props) {
    var results = [];
    var roots = getRoots();
    for (var i = 0; i < roots.length; i++) {
      walk(roots[i], function (fiber) {
        var typeName = typeof fiber.type === 'string'
          ? fiber.type
          : (fiber.type && (fiber.type.displayName || fiber.type.name)) || '';
        if (typeName !== name) return;
        if (props) {
          var keys = Object.keys(props);
          for (var k = 0; k < keys.length; k++) {
            if (!fiber.memoizedProps || fiber.memoizedProps[keys[k]] !== props[keys[k]]) return;
          }
        }
        var nodeId = register(fiber);
        results.push({ nodeId: nodeId, componentType: typeName });
      });
    }
    return results;
  }

  // Resolve the committed ("current") fiber for a registry entry.
  // After reconciliation, React swaps which of the two alternating fiber objects is
  // "current". If the registered fiber is now the stale alternate, return its .alternate.
  function getCurrentFiber(nodeId) {
    var fiber = registry[nodeId];
    if (!fiber) return null;
    var roots = getRoots();
    for (var i = 0; i < roots.length; i++) {
      var found = false;
      walk(roots[i], function (f) { if (f === fiber) found = true; });
      if (found) return fiber;
    }
    return fiber.alternate || fiber;
  }

  // Walk up the tree to find the nearest onPress handler.
  function findOnPress(fiber) {
    var current = fiber;
    while (current) {
      if (current.memoizedProps && typeof current.memoizedProps.onPress === 'function') {
        return current.memoizedProps.onPress;
      }
      current = current.return;
    }
    return null;
  }

  function typeText(nodeId, text) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    var current = fiber;
    while (current) {
      if (current.memoizedProps && typeof current.memoizedProps.onChangeText === 'function') {
        try { current.memoizedProps.onChangeText(text); return true; } catch (e) { return false; }
      }
      current = current.return;
    }
    return false;
  }

  function longPress(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    var current = fiber;
    while (current) {
      if (current.memoizedProps && typeof current.memoizedProps.onLongPress === 'function') {
        try { current.memoizedProps.onLongPress({ nativeEvent: {} }); return true; } catch (e) { return false; }
      }
      current = current.return;
    }
    return false;
  }

  function focus(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    var current = fiber;
    while (current) {
      if (current.memoizedProps && typeof current.memoizedProps.onFocus === 'function') {
        try { current.memoizedProps.onFocus({ nativeEvent: {} }); return true; } catch (e) { return false; }
      }
      current = current.return;
    }
    // Fallback: try stateNode.focus() on HostComponent
    if (fiber.stateNode && typeof fiber.stateNode.focus === 'function') {
      try { fiber.stateNode.focus(); return true; } catch (e) {}
    }
    return false;
  }

  function blur(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    var current = fiber;
    while (current) {
      if (current.memoizedProps && typeof current.memoizedProps.onBlur === 'function') {
        try { current.memoizedProps.onBlur({ nativeEvent: {} }); return true; } catch (e) { return false; }
      }
      current = current.return;
    }
    if (fiber.stateNode && typeof fiber.stateNode.blur === 'function') {
      try { fiber.stateNode.blur(); return true; } catch (e) {}
    }
    return false;
  }

  function submitEditing(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    var current = fiber;
    while (current) {
      if (current.memoizedProps && typeof current.memoizedProps.onSubmitEditing === 'function') {
        try { current.memoizedProps.onSubmitEditing({ nativeEvent: {} }); return true; } catch (e) { return false; }
      }
      current = current.return;
    }
    return false;
  }

  function scrollElement(nodeId, offset) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    var name = typeof fiber.type === 'string'
      ? fiber.type
      : (fiber.type && (fiber.type.displayName || fiber.type.name)) || '';
    if ((name === 'VirtualizedList' || name === 'FlatList') && fiber.stateNode) {
      var inst = fiber.stateNode;
      if (typeof inst.scrollToOffset === 'function') {
        inst.scrollToOffset({ offset: offset, animated: false });
        return true;
      }
      if (typeof inst.scrollToEnd === 'function') {
        inst.scrollToEnd({ animated: false });
        return true;
      }
    }
    if (name === 'ScrollView') {
      if (fiber.ref && typeof fiber.ref.scrollTo === 'function') {
        fiber.ref.scrollTo({ y: offset, animated: false });
        return true;
      }
      if (fiber.stateNode && typeof fiber.stateNode.scrollTo === 'function') {
        fiber.stateNode.scrollTo({ y: offset, animated: false });
        return true;
      }
    }
    return false;
  }

  function scrollElementToX(nodeId, xOffset) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    var name = typeof fiber.type === 'string'
      ? fiber.type
      : (fiber.type && (fiber.type.displayName || fiber.type.name)) || '';
    // FlatList/VirtualizedList — scrollToOffset works for both horizontal and vertical axes
    if ((name === 'VirtualizedList' || name === 'FlatList') && fiber.stateNode) {
      var inst = fiber.stateNode;
      if (typeof inst.scrollToOffset === 'function') {
        inst.scrollToOffset({ offset: xOffset, animated: false });
        return true;
      }
    }
    // ScrollView — use scrollTo({x})
    if (fiber.ref && typeof fiber.ref.scrollTo === 'function') {
      fiber.ref.scrollTo({ x: xOffset, animated: false });
      return true;
    }
    if (fiber.stateNode && typeof fiber.stateNode.scrollTo === 'function') {
      fiber.stateNode.scrollTo({ x: xOffset, animated: false });
      return true;
    }
    return false;
  }

  function dismissKeyboard() {
    var roots = getRoots();
    for (var i = 0; i < roots.length; i++) {
      var found = false;
      walk(roots[i], function (f) {
        if (found) return;
        var name = typeof f.type === 'string'
          ? f.type
          : (f.type && (f.type.displayName || f.type.name)) || '';
        if (name === 'TextInput' && f.stateNode && typeof f.stateNode.blur === 'function') {
          try { f.stateNode.blur(); found = true; } catch (e) {}
        }
      });
      if (found) return true;
    }
    return false;
  }

  function getFrame(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return Promise.resolve(null);
    // Walk up to find the nearest HostComponent (tag === 5) with a stateNode
    var current = fiber;
    while (current) {
      if (current.tag === 5 && current.stateNode && typeof current.stateNode.measure === 'function') {
        return new Promise(function (resolve) {
          current.stateNode.measure(function (x, y, width, height, pageX, pageY) {
            resolve({ x: pageX, y: pageY, width: width, height: height });
          });
        });
      }
      current = current.return;
    }
    return Promise.resolve(null);
  }

  function isEnabled(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    var p = fiber.memoizedProps || {};
    if (p.disabled === true) return false;
    if (p.accessibilityState && p.accessibilityState.disabled === true) return false;
    return true;
  }

  function isFocused(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    var p = fiber.memoizedProps || {};
    return !!(p.accessibilityState && p.accessibilityState.focused === true);
  }

  function tap(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    var onPress = findOnPress(fiber);
    if (!onPress) return false;
    try {
      onPress({ nativeEvent: {} });
      return true;
    } catch (e) {
      return false;
    }
  }

  // Concatenate all text content from tag-6 (HostText) fiber descendants.
  function getText(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return '';
    var parts = [];
    // Collect text from this fiber itself, then walk ONLY its children/descendants.
    // Never walk fiber.sibling here — siblings are adjacent tree nodes, not children.
    if (fiber.tag === 6 && typeof fiber.memoizedProps === 'string') {
      parts.push(fiber.memoizedProps);
    }
    walk(fiber.child, function (f) {
      if (f.tag === 6 && typeof f.memoizedProps === 'string') {
        parts.push(f.memoizedProps);
      }
    });
    return parts.join('');
  }

  function exists(testID) {
    return findByTestID(testID) !== null;
  }

  // Scroll a FlatList/ScrollView to the given y-offset.
  // Tries multiple strategies since VirtualizedList may be a class or function component.
  function scrollToOffset(offset) {
    var roots = getRoots();

    function tryScroll(fiber) {
      var name = typeof fiber.type === 'string'
        ? fiber.type
        : (fiber.type && (fiber.type.displayName || fiber.type.name)) || '';

      // Strategy 1: VirtualizedList/FlatList class instance on stateNode
      if ((name === 'VirtualizedList' || name === 'FlatList') && fiber.stateNode) {
        var inst = fiber.stateNode;
        if (typeof inst.scrollToOffset === 'function') {
          inst.scrollToOffset({ offset: offset, animated: false });
          return true;
        }
        if (typeof inst.scrollToEnd === 'function') {
          inst.scrollToEnd({ animated: false });
          return true;
        }
      }

      // Strategy 2: ScrollView ref or stateNode
      if (name === 'ScrollView') {
        if (fiber.ref && typeof fiber.ref.scrollTo === 'function') {
          fiber.ref.scrollTo({ y: offset, animated: false });
          return true;
        }
        if (fiber.stateNode && typeof fiber.stateNode.scrollTo === 'function') {
          fiber.stateNode.scrollTo({ y: offset, animated: false });
          return true;
        }
      }

      return false;
    }

    for (var i = 0; i < roots.length; i++) {
      var done = false;
      walk(roots[i], function (f) {
        if (!done) done = tryScroll(f);
      });
      if (done) return true;
    }
    return false;
  }

  // Depth-limited tree serialization for debugging (never walk return links).
  function getTree(maxDepth) {
    maxDepth = maxDepth || 30;
    function serialize(fiber, depth) {
      if (!fiber || depth > maxDepth) return null;
      var name = typeof fiber.type === 'string'
        ? fiber.type
        : (fiber.type && (fiber.type.displayName || fiber.type.name)) || null;
      var testID = fiber.memoizedProps ? fiber.memoizedProps.testID : undefined;
      return {
        type: name,
        testID: testID || null,
        children: [
          serialize(fiber.child, depth + 1),
          serialize(fiber.sibling, depth + 1),
        ].filter(Boolean),
      };
    }
    var roots = getRoots();
    return roots.map(function (r) { return serialize(r, 0); });
  }

  function swipe(nodeId, direction, distance) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;

    var dx = direction === 'left'  ? -distance
           : direction === 'right' ?  distance : 0;
    var dy = direction === 'up'    ? -distance
           : direction === 'down'  ?  distance : 0;

    var current = fiber;
    while (current) {
      var p = current.memoizedProps;
      if (p && (typeof p.onResponderGrant === 'function' ||
                typeof p.onStartShouldSetResponder === 'function')) {

        // Build a realistic touch record so PanResponder's internal _updateGestureStateOnMove
        // can read touchHistory.touchBank and compute the correct dx/dy from centroids.
        var now = Date.now();
        var startX = 200, startY = 400;
        var touchRecord = {
          touchActive: true,
          startPageX: startX, startPageY: startY, startTimeStamp: now,
          currentPageX: startX, currentPageY: startY, currentTimeStamp: now,
          previousPageX: startX, previousPageY: startY, previousTimeStamp: now,
        };
        var touchHistory = {
          touchBank: [touchRecord],
          numberActiveTouches: 1,
          indexOfSingleActiveTouch: 0,
          mostRecentTimeStamp: now,
        };
        var evt = {
          nativeEvent: {
            pageX: startX, pageY: startY, locationX: 0, locationY: 0,
            timestamp: now, identifier: 0, target: 0,
            touches: [touchRecord], changedTouches: [touchRecord],
          },
          touchHistory: touchHistory,
        };
        var gs = {
          stateID: now, moveX: startX, moveY: startY, x0: startX, y0: startY,
          dx: 0, dy: 0, vx: 0, vy: 0, numberActiveTouches: 1,
          _accountsForMovesUpTo: now,
        };

        try {
          if (typeof p.onResponderGrant === 'function') p.onResponderGrant(evt, gs);

          var STEPS = 10;
          for (var i = 1; i <= STEPS; i++) {
            var stepTime = now + i * 30;
            var curX = startX + dx * i / STEPS;
            var curY = startY + dy * i / STEPS;
            touchRecord.previousPageX = touchRecord.currentPageX;
            touchRecord.previousPageY = touchRecord.currentPageY;
            touchRecord.previousTimeStamp = touchRecord.currentTimeStamp;
            touchRecord.currentPageX = curX;
            touchRecord.currentPageY = curY;
            touchRecord.currentTimeStamp = stepTime;
            touchHistory.mostRecentTimeStamp = stepTime;
            evt.nativeEvent.pageX = curX;
            evt.nativeEvent.pageY = curY;
            evt.nativeEvent.timestamp = stepTime;
            if (typeof p.onResponderMove === 'function') p.onResponderMove(evt, gs);
          }

          // Release: touch stays "active" so centroid resolves to final position.
          // PanResponder checks numberActiveTouches to detect end-of-gesture.
          var releaseTime = now + (STEPS + 1) * 30;
          touchRecord.currentPageX = startX + dx;
          touchRecord.currentPageY = startY + dy;
          touchRecord.currentTimeStamp = releaseTime;
          touchHistory.mostRecentTimeStamp = releaseTime;
          touchHistory.numberActiveTouches = 0;
          evt.nativeEvent.pageX = startX + dx;
          evt.nativeEvent.pageY = startY + dy;
          evt.nativeEvent.timestamp = releaseTime;
          if (typeof p.onResponderRelease === 'function') p.onResponderRelease(evt, gs);
        } catch (e) {
          return 'ERR:' + String(e);
        }
        return true;
      }
      current = current.return;
    }
    return 'NO_HANDLERS';
  }

  globalThis.__testBridge__ = {
    findByTestID: findByTestID,
    findByComponent: findByComponent,
    tap: tap,
    longPress: longPress,
    typeText: typeText,
    focus: focus,
    blur: blur,
    submitEditing: submitEditing,
    getText: getText,
    exists: exists,
    isEnabled: isEnabled,
    isFocused: isFocused,
    getFrame: getFrame,
    getTree: getTree,
    scrollToOffset: scrollToOffset,
    scrollElement: scrollElement,
    scrollElementToX: scrollElementToX,
    dismissKeyboard: dismissKeyboard,
    swipe: swipe,
  };

  return true;
})()
`;
