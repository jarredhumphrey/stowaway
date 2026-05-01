export type Selector =
  | { testID: string }
  | { component: string; props?: Record<string, unknown> }
  | { text: string; exact?: boolean }
  | { text: RegExp }
  | { accessibilityLabel: string; exact?: boolean };

// ── Global expression builders ────────────────────────────────────────────────
// Generate a JS expression (evaluated inside Hermes) that returns NodeDescriptor|null.

export function selectorToExpression(selector: Selector): string {
  if ('testID' in selector) {
    return `__testBridge__.findByTestID(${JSON.stringify(selector.testID)})`;
  }
  if ('component' in selector) {
    const props = selector.props ? JSON.stringify(selector.props) : 'null';
    return `(function() { var r = __testBridge__.findByComponent(${JSON.stringify(selector.component)}, ${props}); return r.length ? r[0] : null; })()`;
  }
  if ('accessibilityLabel' in selector) {
    const s = selector as { accessibilityLabel: string; exact?: boolean };
    const exact = s.exact !== false;
    return `(function() { var r = __testBridge__.findByAccessibilityLabel(${JSON.stringify(s.accessibilityLabel)}, ${exact}); return r.length ? r[0] : null; })()`;
  }
  const ts = selector as { text: string | RegExp; exact?: boolean };
  if (ts.text instanceof RegExp) {
    return `(function() {
      var rx = new RegExp(${JSON.stringify(ts.text.source)}, ${JSON.stringify(ts.text.flags)});
      var results = __testBridge__.findByComponent('Text');
      for (var i = 0; i < results.length; i++) {
        if (rx.test(__testBridge__.getText(results[i].nodeId))) return results[i];
      }
      return null;
    })()`;
  }
  if (ts.exact === false) {
    return `(function() {
      var needle = ${JSON.stringify(ts.text)};
      var results = __testBridge__.findByComponent('Text');
      for (var i = 0; i < results.length; i++) {
        if (__testBridge__.getText(results[i].nodeId).includes(needle)) return results[i];
      }
      return null;
    })()`;
  }
  return `(function() {
    var results = __testBridge__.findByComponent('Text');
    for (var i = 0; i < results.length; i++) {
      var t = __testBridge__.getText(results[i].nodeId);
      if (t === ${JSON.stringify(ts.text)}) return results[i];
    }
    return null;
  })()`;
}

// Generate a JS expression that returns NodeDescriptor[].
export function selectorToAllExpression(selector: Selector): string {
  if ('testID' in selector) {
    return `(function() { var r = __testBridge__.findByTestID(${JSON.stringify(selector.testID)}); return r ? [r] : []; })()`;
  }
  if ('component' in selector) {
    const props = selector.props ? JSON.stringify(selector.props) : 'null';
    return `__testBridge__.findByComponent(${JSON.stringify(selector.component)}, ${props})`;
  }
  if ('accessibilityLabel' in selector) {
    const s = selector as { accessibilityLabel: string; exact?: boolean };
    const exact = s.exact !== false;
    return `__testBridge__.findByAccessibilityLabel(${JSON.stringify(s.accessibilityLabel)}, ${exact})`;
  }
  const ts = selector as { text: string | RegExp; exact?: boolean };
  if (ts.text instanceof RegExp) {
    return `(function() {
      var rx = new RegExp(${JSON.stringify(ts.text.source)}, ${JSON.stringify(ts.text.flags)});
      return __testBridge__.findByComponent('Text').filter(function(r) {
        return rx.test(__testBridge__.getText(r.nodeId));
      });
    })()`;
  }
  if (ts.exact === false) {
    return `(function() {
      var needle = ${JSON.stringify(ts.text)};
      return __testBridge__.findByComponent('Text').filter(function(r) {
        return __testBridge__.getText(r.nodeId).includes(needle);
      });
    })()`;
  }
  return `(function() {
    var results = __testBridge__.findByComponent('Text');
    return results.filter(function(r) {
      return __testBridge__.getText(r.nodeId) === ${JSON.stringify(ts.text)};
    });
  })()`;
}

// ── Scoped expression builders ────────────────────────────────────────────────
// Like above but constrained to the subtree of a specific node (by nodeId).

export function selectorToExpressionWithin(nodeId: number, selector: Selector): string {
  if ('testID' in selector) {
    return `__testBridge__.findByTestIDWithin(${nodeId}, ${JSON.stringify(selector.testID)})`;
  }
  if ('component' in selector) {
    const props = selector.props ? JSON.stringify(selector.props) : 'null';
    return `(function() { var r = __testBridge__.findByComponentWithin(${nodeId}, ${JSON.stringify(selector.component)}, ${props}); return r.length ? r[0] : null; })()`;
  }
  if ('accessibilityLabel' in selector) {
    const s = selector as { accessibilityLabel: string; exact?: boolean };
    const exact = s.exact !== false;
    return `(function() { var r = __testBridge__.findByAccessibilityLabelWithin(${nodeId}, ${JSON.stringify(s.accessibilityLabel)}, ${exact}); return r.length ? r[0] : null; })()`;
  }
  const ts = selector as { text: string | RegExp; exact?: boolean };
  if (ts.text instanceof RegExp) {
    return `(function() {
      var rx = new RegExp(${JSON.stringify(ts.text.source)}, ${JSON.stringify(ts.text.flags)});
      var results = __testBridge__.findByComponentWithin(${nodeId}, 'Text', null);
      for (var i = 0; i < results.length; i++) {
        if (rx.test(__testBridge__.getText(results[i].nodeId))) return results[i];
      }
      return null;
    })()`;
  }
  if (ts.exact === false) {
    return `(function() {
      var needle = ${JSON.stringify(ts.text)};
      var results = __testBridge__.findByComponentWithin(${nodeId}, 'Text', null);
      for (var i = 0; i < results.length; i++) {
        if (__testBridge__.getText(results[i].nodeId).includes(needle)) return results[i];
      }
      return null;
    })()`;
  }
  return `(function() {
    var results = __testBridge__.findByComponentWithin(${nodeId}, 'Text', null);
    for (var i = 0; i < results.length; i++) {
      if (__testBridge__.getText(results[i].nodeId) === ${JSON.stringify(ts.text)}) return results[i];
    }
    return null;
  })()`;
}

export function selectorToAllExpressionWithin(nodeId: number, selector: Selector): string {
  if ('testID' in selector) {
    return `(function() { var r = __testBridge__.findByTestIDWithin(${nodeId}, ${JSON.stringify(selector.testID)}); return r ? [r] : []; })()`;
  }
  if ('component' in selector) {
    const props = selector.props ? JSON.stringify(selector.props) : 'null';
    return `__testBridge__.findByComponentWithin(${nodeId}, ${JSON.stringify(selector.component)}, ${props})`;
  }
  if ('accessibilityLabel' in selector) {
    const s = selector as { accessibilityLabel: string; exact?: boolean };
    const exact = s.exact !== false;
    return `__testBridge__.findByAccessibilityLabelWithin(${nodeId}, ${JSON.stringify(s.accessibilityLabel)}, ${exact})`;
  }
  const ts = selector as { text: string | RegExp; exact?: boolean };
  if (ts.text instanceof RegExp) {
    return `(function() {
      var rx = new RegExp(${JSON.stringify(ts.text.source)}, ${JSON.stringify(ts.text.flags)});
      return __testBridge__.findByComponentWithin(${nodeId}, 'Text', null).filter(function(r) {
        return rx.test(__testBridge__.getText(r.nodeId));
      });
    })()`;
  }
  if (ts.exact === false) {
    return `(function() {
      var needle = ${JSON.stringify(ts.text)};
      return __testBridge__.findByComponentWithin(${nodeId}, 'Text', null).filter(function(r) {
        return __testBridge__.getText(r.nodeId).includes(needle);
      });
    })()`;
  }
  return `(function() {
    var results = __testBridge__.findByComponentWithin(${nodeId}, 'Text', null);
    return results.filter(function(r) {
      return __testBridge__.getText(r.nodeId) === ${JSON.stringify(ts.text)};
    });
  })()`;
}
