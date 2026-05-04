(function () {
  var hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook) return false;

  // Registry maps integer nodeId -> fiber reference
  var registry = [];

  // Track which nodeId was most recently focused via focus(). Cleared on blur().
  // ReactNativeFiberHostComponent does not expose isFocused(), so we track it here.
  var _focusedNodeId = null;

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

  // Collect all HostText (tag-6) descendant strings from a fiber.
  function collectText(fiber) {
    var parts = [];
    if (fiber.tag === 6 && typeof fiber.memoizedProps === 'string') {
      parts.push(fiber.memoizedProps);
    }
    walk(fiber.child, function (f) {
      if (f.tag === 6 && typeof f.memoizedProps === 'string') parts.push(f.memoizedProps);
    });
    return parts.join('');
  }

  // Register a fiber and return a NodeDescriptor for it.
  function makeDescriptor(fiber) {
    var nodeId = register(fiber);
    var testID = fiber.memoizedProps ? fiber.memoizedProps.testID : undefined;
    return { nodeId: nodeId, componentType: getTypeName(fiber), testID: testID || undefined };
  }

  // True for fibers that are semantically meaningful parents/ancestors.
  // Includes HostComponents (native views) and named composite components.
  // Excludes anonymous HOC shells, Context providers/consumers, Fragments, etc.
  function isMeaningfulFiber(fiber) {
    var tag = fiber.tag;
    if (tag === 5) return true; // HostComponent (View, Text, etc.)
    // FunctionComponent(0), ClassComponent(1), ForwardRef(11), Memo(14/15) — only if named
    if (tag === 0 || tag === 1 || tag === 11 || tag === 14 || tag === 15) {
      var name = getTypeName(fiber);
      return name !== '' && name !== 'Unknown';
    }
    return false;
  }

  function getTypeName(fiber) {
    return typeof fiber.type === 'string'
      ? fiber.type
      : (fiber.type && (fiber.type.displayName || fiber.type.name)) || 'Unknown';
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

  function findByAccessibilityLabel(label, exact) {
    var results = [];
    var roots = getRoots();
    for (var i = 0; i < roots.length; i++) {
      walk(roots[i], function (fiber) {
        var p = fiber.memoizedProps;
        if (!p) return;
        var al = p.accessibilityLabel;
        if (typeof al !== 'string') return;
        var match = exact === false ? al.includes(label) : al === label;
        if (!match) return;
        var nodeId = register(fiber);
        var typeName = typeof fiber.type === 'string'
          ? fiber.type
          : (fiber.type && (fiber.type.displayName || fiber.type.name)) || 'Unknown';
        results.push({ nodeId: nodeId, componentType: typeName });
      });
    }
    return results;
  }

  function findByComponent(name, props) {
    var results = [];
    var roots = getRoots();
    for (var i = 0; i < roots.length; i++) {
      walk(roots[i], function (fiber) {
        if (getTypeName(fiber) !== name) return;
        // Skip inner wrappers: if the parent fiber has the same name, this fiber is the
        // inner implementation of a HOC stack (e.g. forwardRef inside memo, same displayName).
        if (fiber.return && getTypeName(fiber.return) === name) return;
        if (props) {
          var keys = Object.keys(props);
          for (var k = 0; k < keys.length; k++) {
            if (!fiber.memoizedProps || fiber.memoizedProps[keys[k]] !== props[keys[k]]) return;
          }
        }
        var nodeId = register(fiber);
        results.push({ nodeId: nodeId, componentType: name });
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

  function findHostFiberDown(fiber) {
    if (fiber.tag === 5 && fiber.stateNode) return fiber;
    var result = null;
    walk(fiber.child, function (f) {
      if (result) return;
      if (f.tag === 5 && f.stateNode) result = f;
    });
    return result;
  }

  function focus(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    // Fire the onFocus event handler so React state updates (e.g. focus indicators) work.
    var current = fiber;
    while (current) {
      if (current.memoizedProps && typeof current.memoizedProps.onFocus === 'function') {
        try { current.memoizedProps.onFocus({ nativeEvent: {} }); } catch (e) {}
        break;
      }
      current = current.return;
    }
    // Natively focus the HostComponent (sends UIManager focus command to native).
    var host = findHostFiberDown(fiber);
    if (host && typeof host.stateNode.focus === 'function') {
      try { host.stateNode.focus(); } catch (e) {}
    }
    // Track focused node in bridge — ReactNativeFiberHostComponent has no isFocused().
    _focusedNodeId = nodeId;
    return true;
  }

  function blur(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    var current = fiber;
    while (current) {
      if (current.memoizedProps && typeof current.memoizedProps.onBlur === 'function') {
        try { current.memoizedProps.onBlur({ nativeEvent: {} }); } catch (e) {}
        break;
      }
      current = current.return;
    }
    var host = findHostFiberDown(fiber);
    if (host && typeof host.stateNode.blur === 'function') {
      try { host.stateNode.blur(); } catch (e) {}
    }
    if (_focusedNodeId === nodeId) _focusedNodeId = null;
    return true;
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
    // Walk DOWN into the fiber's own subtree to find the nearest HostComponent (tag 5).
    // React components (ForwardRef, function) render their native view as a child, not an
    // ancestor — walking up via fiber.return finds ancestor containers (e.g. ScrollView)
    // rather than the element's own native view, producing wrong coordinates for dragTo().
    var hostFiber = null;
    if (fiber.tag === 5 && fiber.stateNode && typeof fiber.stateNode.measure === 'function') {
      hostFiber = fiber;
    }
    if (!hostFiber) {
      walk(fiber.child, function (f) {
        if (hostFiber) return;
        if (f.tag === 5 && f.stateNode && typeof f.stateNode.measure === 'function') {
          hostFiber = f;
        }
      });
    }
    if (!hostFiber) return Promise.resolve(null);
    return new Promise(function (resolve) {
      hostFiber.stateNode.measure(function (x, y, width, height, pageX, pageY) {
        resolve({ x: pageX, y: pageY, width: width, height: height });
      });
    });
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
    // Check bridge-tracked focus first (set by our focus() / cleared by blur()).
    if (_focusedNodeId === nodeId) return true;
    // Fallback: consumer component set accessibilityState.focused on the fiber.
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
    return collectText(fiber);
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
      var kids = [];
      var child = fiber.child;
      while (child) {
        var node = serialize(child, depth + 1);
        if (node) kids.push(node);
        child = child.sibling;
      }
      return { type: name, testID: testID || null, children: kids };
    }
    var roots = getRoots();
    return roots.map(function (r) { return serialize(r, 0); });
  }

  // Shared PanResponder simulation: fire grant→moves→release with the given dx/dy delta.
  // Searches up from startFiber for the nearest ancestor with PanResponder handlers.
  function firePanGesture(startFiber, dx, dy) {
    var current = startFiber;
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

  function swipe(nodeId, direction, distance) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    var dx = direction === 'left'  ? -distance
           : direction === 'right' ?  distance : 0;
    var dy = direction === 'up'    ? -distance
           : direction === 'down'  ?  distance : 0;
    return firePanGesture(fiber, dx, dy);
  }

  function dragFromTo(nodeId, dx, dy) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    return firePanGesture(fiber, dx, dy);
  }

  // Measure both elements and fire the pan gesture in a single synchronous evaluation.
  // In Fabric (RN new arch), stateNode.measure() calls its callback synchronously, so the
  // frames are available immediately without a promise round-trip through CDP.
  function dragToElement(srcNodeId, tgtNodeId) {
    var srcFiber = getCurrentFiber(srcNodeId);
    var tgtFiber = getCurrentFiber(tgtNodeId);
    if (!srcFiber || !tgtFiber) return 'NO_FIBER';

    var findHostFiber = function (fiber) {
      if (fiber.tag === 5 && fiber.stateNode) return fiber;
      var result = null;
      walk(fiber.child, function (f) {
        if (result) return;
        if (f.tag === 5 && f.stateNode) result = f;
      });
      return result;
    };

    var srcHost = findHostFiber(srcFiber);
    var tgtHost = findHostFiber(tgtFiber);

    var srcFrame = null, tgtFrame = null;
    if (srcHost && typeof srcHost.stateNode.measure === 'function') {
      try { srcHost.stateNode.measure(function (x, y, w, h, px, py) { srcFrame = { x: px, y: py, w: w, h: h }; }); } catch (e) {}
    }
    if (tgtHost && typeof tgtHost.stateNode.measure === 'function') {
      try { tgtHost.stateNode.measure(function (x, y, w, h, px, py) { tgtFrame = { x: px, y: py, w: w, h: h }; }); } catch (e) {}
    }

    var dx, dy;
    if (srcFrame && tgtFrame && (srcFrame.x !== 0 || srcFrame.y !== 0 || tgtFrame.x !== 0 || tgtFrame.y !== 0)) {
      dx = (tgtFrame.x + tgtFrame.w / 2) - (srcFrame.x + srcFrame.w / 2);
      dy = (tgtFrame.y + tgtFrame.h / 2) - (srcFrame.y + srcFrame.h / 2);
    } else {
      dx = 0;
      dy = 200;
    }

    return firePanGesture(srcFiber, dx, dy);
  }

  function doubleTap(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    // Prefer an explicit double-tap handler if one exists anywhere in the ancestor chain.
    var current = fiber;
    while (current) {
      var p = current.memoizedProps;
      if (p) {
        if (typeof p.onDoublePress === 'function') {
          try { p.onDoublePress({ nativeEvent: {} }); return true; } catch (e) { return false; }
        }
        if (typeof p.onDoubleTap === 'function') {
          try { p.onDoubleTap({ nativeEvent: {} }); return true; } catch (e) { return false; }
        }
      }
      current = current.return;
    }
    // Fallback: fire onPress twice — covers apps that count rapid taps manually.
    var onPress = findOnPress(fiber);
    if (!onPress) return false;
    try {
      onPress({ nativeEvent: {} });
      onPress({ nativeEvent: {} });
      return true;
    } catch (e) {
      return false;
    }
  }

  function getInputValue(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return '';
    var p = fiber.memoizedProps || {};
    var val = p.value !== undefined ? p.value : (p.defaultValue !== undefined ? p.defaultValue : '');
    return val === null ? '' : String(val);
  }

  function findByAccessibilityRole(role) {
    var results = [];
    var roots = getRoots();
    for (var i = 0; i < roots.length; i++) {
      walk(roots[i], function (fiber) {
        var p = fiber.memoizedProps;
        if (!p || p.accessibilityRole !== role) return;
        // Skip inner HOC wrappers that receive the same prop passthrough.
        if (fiber.return && fiber.return.memoizedProps && fiber.return.memoizedProps.accessibilityRole === role) return;
        results.push({ nodeId: register(fiber), componentType: getTypeName(fiber) });
      });
    }
    return results;
  }

  function findByAccessibilityRoleWithin(rootNodeId, role) {
    var rootFiber = getCurrentFiber(rootNodeId);
    if (!rootFiber) return [];
    var results = [];
    walk(rootFiber.child, function (fiber) {
      var p = fiber.memoizedProps;
      if (!p || p.accessibilityRole !== role) return;
      if (fiber.return && fiber.return.memoizedProps && fiber.return.memoizedProps.accessibilityRole === role) return;
      results.push({ nodeId: register(fiber), componentType: getTypeName(fiber) });
    });
    return results;
  }

  function findByPlaceholder(placeholder, exact) {
    var results = [];
    var roots = getRoots();
    for (var i = 0; i < roots.length; i++) {
      walk(roots[i], function (fiber) {
        if (fiber.tag === 5 || fiber.tag === 6) return; // skip HostComponent / HostText
        var p = fiber.memoizedProps;
        if (!p || typeof p.placeholder !== 'string') return;
        var match = exact === false ? p.placeholder.includes(placeholder) : p.placeholder === placeholder;
        if (!match) return;
        // Skip inner HOC wrappers that pass the same placeholder through.
        if (fiber.return && fiber.return.memoizedProps && fiber.return.memoizedProps.placeholder === p.placeholder) return;
        results.push({ nodeId: register(fiber), componentType: getTypeName(fiber) });
      });
    }
    return results;
  }

  function findByPlaceholderWithin(rootNodeId, placeholder, exact) {
    var rootFiber = getCurrentFiber(rootNodeId);
    if (!rootFiber) return [];
    var results = [];
    walk(rootFiber.child, function (fiber) {
      if (fiber.tag === 5 || fiber.tag === 6) return;
      var p = fiber.memoizedProps;
      if (!p || typeof p.placeholder !== 'string') return;
      var match = exact === false ? p.placeholder.includes(placeholder) : p.placeholder === placeholder;
      if (!match) return;
      if (fiber.return && fiber.return.memoizedProps && fiber.return.memoizedProps.placeholder === p.placeholder) return;
      results.push({ nodeId: register(fiber), componentType: getTypeName(fiber) });
    });
    return results;
  }

  // ── Scoped queries ────────────────────────────────────────────────────────────
  // Walk only the subtree of rootNodeId (starting from its first child).

  function findByTestIDWithin(rootNodeId, testID) {
    var rootFiber = getCurrentFiber(rootNodeId);
    if (!rootFiber) return null;
    var found = null;
    walk(rootFiber.child, function (fiber) {
      if (found) return;
      if (fiber.memoizedProps && fiber.memoizedProps.testID === testID) {
        found = { nodeId: register(fiber), componentType: getTypeName(fiber), testID: testID };
      }
    });
    return found;
  }

  function findByComponentWithin(rootNodeId, name, props) {
    var rootFiber = getCurrentFiber(rootNodeId);
    if (!rootFiber) return [];
    var results = [];
    walk(rootFiber.child, function (fiber) {
      if (getTypeName(fiber) !== name) return;
      if (fiber.return && getTypeName(fiber.return) === name) return;
      if (props) {
        var keys = Object.keys(props);
        for (var k = 0; k < keys.length; k++) {
          if (!fiber.memoizedProps || fiber.memoizedProps[keys[k]] !== props[keys[k]]) return;
        }
      }
      results.push({ nodeId: register(fiber), componentType: name });
    });
    return results;
  }

  function findByAccessibilityLabelWithin(rootNodeId, label, exact) {
    var rootFiber = getCurrentFiber(rootNodeId);
    if (!rootFiber) return [];
    var results = [];
    walk(rootFiber.child, function (fiber) {
      var p = fiber.memoizedProps;
      if (!p) return;
      var al = p.accessibilityLabel;
      if (typeof al !== 'string') return;
      var match = exact === false ? al.includes(label) : al === label;
      if (!match) return;
      results.push({ nodeId: register(fiber), componentType: getTypeName(fiber) });
    });
    return results;
  }

  function pressKey(nodeId, key) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    var current = fiber;
    while (current) {
      var p = current.memoizedProps;
      if (p && typeof p.onKeyPress === 'function') {
        try { p.onKeyPress({ nativeEvent: { key: key, keyCode: 0 } }); return true; } catch (e) { return false; }
      }
      current = current.return;
    }
    return false;
  }

  function isChecked(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    return !!(fiber.memoizedProps && fiber.memoizedProps.value);
  }

  function setChecked(nodeId, checked) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    var current = fiber;
    while (current) {
      var p = current.memoizedProps;
      if (p && typeof p.onValueChange === 'function') {
        try { p.onValueChange(checked); return true; } catch (e) { return false; }
      }
      current = current.return;
    }
    return false;
  }

  function selectOption(nodeId, value) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    var current = fiber;
    while (current) {
      var p = current.memoizedProps;
      if (p && typeof p.onValueChange === 'function') {
        try { p.onValueChange(value); return true; } catch (e) { return false; }
      }
      current = current.return;
    }
    return false;
  }

  // ── Tree traversal (parent / sibling / closest) ───────────────────────────

  function getParent(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return null;
    var current = fiber.return;
    while (current) {
      if (current.tag === 3) return null; // HostRoot — no meaningful parent
      if (isMeaningfulFiber(current)) return makeDescriptor(current);
      current = current.return;
    }
    return null;
  }

  function getSiblings(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return [];
    var parent = fiber.return;
    if (!parent) return [];
    var results = [];
    var sibling = parent.child;
    while (sibling) {
      if (sibling !== fiber) results.push(makeDescriptor(sibling));
      sibling = sibling.sibling;
    }
    return results;
  }

  function findSibling(nodeId, type, value, exact, regexFlags) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return null;
    var parent = fiber.return;
    if (!parent) return null;
    var sibling = parent.child;
    while (sibling) {
      if (sibling !== fiber && matchesSelectorType(sibling, type, value, exact, regexFlags)) {
        return makeDescriptor(sibling);
      }
      sibling = sibling.sibling;
    }
    return null;
  }

  function getNextSibling(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return null;
    return fiber.sibling ? makeDescriptor(fiber.sibling) : null;
  }

  function getPreviousSibling(nodeId) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return null;
    var parent = fiber.return;
    if (!parent) return null;
    var prev = null;
    var current = parent.child;
    while (current) {
      if (current === fiber) return prev ? makeDescriptor(prev) : null;
      prev = current;
      current = current.sibling;
    }
    return null;
  }

  function matchesSelectorType(fiber, type, value, exact, regexFlags) {
    var p = fiber.memoizedProps;
    if (type === 'testID') return !!(p && p.testID === value);
    if (type === 'component') return getTypeName(fiber) === value;
    if (type === 'text') {
      var text = collectText(fiber);
      if (regexFlags !== undefined) {
        try { return new RegExp(value, regexFlags).test(text); } catch (e) { return false; }
      }
      return exact === false ? text.includes(value) : text === value;
    }
    if (type === 'accessibilityLabel') {
      var al = p && p.accessibilityLabel;
      if (typeof al !== 'string') return false;
      return exact === false ? al.includes(value) : al === value;
    }
    if (type === 'accessibilityRole') return !!(p && p.accessibilityRole === value);
    if (type === 'placeholder') {
      var pl = p && p.placeholder;
      if (typeof pl !== 'string') return false;
      return exact === false ? pl.includes(value) : pl === value;
    }
    return false;
  }

  // Walk up fiber.return searching for the nearest ancestor matching selector.
  // type/value/exact mirror the Selector union fields; regexFlags is set for RegExp text matching.
  function closest(nodeId, type, value, exact, regexFlags) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return null;
    var current = fiber.return;
    while (current) {
      if (current.tag === 3) break; // HostRoot — give up
      if (matchesSelectorType(current, type, value, exact, regexFlags)) {
        return makeDescriptor(current);
      }
      current = current.return;
    }
    return null;
  }

  function setDateValue(nodeId, timestamp) {
    var date = new Date(timestamp);
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    var current = fiber;
    while (current) {
      var p = current.memoizedProps;
      if (p && typeof p.onDateChange === 'function') {
        try { p.onDateChange(date); return true; } catch (e) {}
      }
      if (p && typeof p.onChange === 'function') {
        try {
          p.onChange({ type: 'set', nativeEvent: { timestamp: timestamp, utcOffset: 0 } }, date);
          return true;
        } catch (e) {}
      }
      if (p && typeof p.onConfirm === 'function') {
        try { p.onConfirm(date); return true; } catch (e) {}
      }
      current = current.return;
    }
    return false;
  }

  function setSliderValue(nodeId, value) {
    var fiber = getCurrentFiber(nodeId);
    if (!fiber) return false;
    var current = fiber;
    while (current) {
      var p = current.memoizedProps;
      if (p && typeof p.onValueChange === 'function') {
        try {
          p.onValueChange(value);
          if (typeof p.onSlidingComplete === 'function') p.onSlidingComplete(value);
          return true;
        } catch (e) { return false; }
      }
      current = current.return;
    }
    return false;
  }

  globalThis.__testBridge__ = {
    findByTestID: findByTestID,
    findByComponent: findByComponent,
    findByAccessibilityLabel: findByAccessibilityLabel,
    findByAccessibilityRole: findByAccessibilityRole,
    findByAccessibilityRoleWithin: findByAccessibilityRoleWithin,
    findByPlaceholder: findByPlaceholder,
    findByPlaceholderWithin: findByPlaceholderWithin,
    tap: tap,
    doubleTap: doubleTap,
    longPress: longPress,
    typeText: typeText,
    focus: focus,
    blur: blur,
    submitEditing: submitEditing,
    getText: getText,
    getInputValue: getInputValue,
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
    dragFromTo: dragFromTo,
    dragToElement: dragToElement,
    findByTestIDWithin: findByTestIDWithin,
    findByComponentWithin: findByComponentWithin,
    findByAccessibilityLabelWithin: findByAccessibilityLabelWithin,
    pressKey: pressKey,
    isChecked: isChecked,
    setChecked: setChecked,
    selectOption: selectOption,
    setDateValue: setDateValue,
    setSliderValue: setSliderValue,
    getParent: getParent,
    getSiblings: getSiblings,
    findSibling: findSibling,
    getNextSibling: getNextSibling,
    getPreviousSibling: getPreviousSibling,
    closest: closest,
  };

  return true;
})()
