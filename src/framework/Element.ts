import type { HermesSession } from './HermesSession';
import type { TraceCollector } from './TraceCollector';
import { type Selector, selectorToExpressionWithin, selectorToAllExpressionWithin } from './selectors';

function selectorLabel(sel: Selector): string {
  if ('testID' in sel) return sel.testID;
  if ('text' in sel) return typeof sel.text === 'string' ? `"${sel.text}"` : sel.text.toString();
  if ('component' in sel) return sel.component;
  if ('accessibilityLabel' in sel) return `a11y:"${sel.accessibilityLabel}"`;
  if ('accessibilityRole' in sel) return `role:${sel.accessibilityRole}`;
  if ('placeholder' in sel) return `placeholder:"${sel.placeholder}"`;
  return JSON.stringify(sel);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// Encode a Selector into positional arguments for bridge traversal functions
// (getParent, getSiblings, closest, etc.) that accept (nodeId, type, value, exact, regexFlags?).
function selectorToBridgeArgs(nodeId: number, sel: Selector): string {
  if ('testID' in sel) {
    return `${nodeId}, 'testID', ${JSON.stringify(sel.testID)}, true`;
  }
  if ('component' in sel) {
    return `${nodeId}, 'component', ${JSON.stringify(sel.component)}, true`;
  }
  if ('text' in sel) {
    if (sel.text instanceof RegExp) {
      return `${nodeId}, 'text', ${JSON.stringify(sel.text.source)}, true, ${JSON.stringify(sel.text.flags)}`;
    }
    const exact = (sel as { exact?: boolean }).exact !== false;
    return `${nodeId}, 'text', ${JSON.stringify(sel.text)}, ${exact}`;
  }
  if ('accessibilityLabel' in sel) {
    const exact = (sel as { exact?: boolean }).exact !== false;
    return `${nodeId}, 'accessibilityLabel', ${JSON.stringify(sel.accessibilityLabel)}, ${exact}`;
  }
  if ('accessibilityRole' in sel) {
    return `${nodeId}, 'accessibilityRole', ${JSON.stringify(sel.accessibilityRole)}, true`;
  }
  if ('placeholder' in sel) {
    const exact = (sel as { exact?: boolean }).exact !== false;
    return `${nodeId}, 'placeholder', ${JSON.stringify(sel.placeholder)}, ${exact}`;
  }
  throw new Error(`Unsupported selector for tree traversal: ${JSON.stringify(sel)}`);
}

export interface NodeDescriptor {
  nodeId: number;
  componentType: string;
  testID?: string;
}

export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Element {
  constructor(
    private descriptor: NodeDescriptor,
    private session: HermesSession,
    private verbose = false,
    private slowDelay = 0,
    private tracer: TraceCollector | null = null,
  ) {}

  get nodeId(): number {
    return this.descriptor.nodeId;
  }

  get label(): string {
    return this.descriptor.testID ?? `node:${this.descriptor.nodeId}`;
  }

  private log(msg: string): void {
    if (this.verbose) console.log(`        ${msg}`);
  }

  private async emitStep(action: string, target: string, value: string | undefined, startMs: number): Promise<void> {
    if (!this.tracer) return;
    const step = { action, target, value, durationMs: Date.now() - startMs, timestampMs: startMs };
    if (this.slowDelay > 0) {
      await this.tracer.addWithScreenshot(step);
    } else {
      this.tracer.add(step);
    }
  }

  async tap(): Promise<void> {
    const start = Date.now();
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.tap(${this.descriptor.nodeId})`,
    );
    if (!ok) {
      throw new Error(
        `tap() failed — no onPress found on node ${this.descriptor.nodeId} ` +
          `(${this.descriptor.componentType})`,
      );
    }
    this.log(`tap: ${this.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('tap', this.label, undefined, start);
  }

  async longPress(): Promise<void> {
    const start = Date.now();
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.longPress(${this.descriptor.nodeId})`,
    );
    if (!ok) {
      throw new Error(
        `longPress() failed — no onLongPress found on node ${this.descriptor.nodeId} ` +
          `(${this.descriptor.componentType})`,
      );
    }
    this.log(`longPress: ${this.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('longPress', this.label, undefined, start);
  }

  async typeText(text: string): Promise<void> {
    const start = Date.now();
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.typeText(${this.descriptor.nodeId}, ${JSON.stringify(text)})`,
    );
    if (!ok) {
      throw new Error(
        `typeText() failed — no onChangeText found on node ${this.descriptor.nodeId} ` +
          `(${this.descriptor.componentType})`,
      );
    }
    this.log(`typeText: ${JSON.stringify(text)} → ${this.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('typeText', this.label, text, start);
  }

  async clearText(): Promise<void> {
    const start = Date.now();
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.typeText(${this.descriptor.nodeId}, "")`,
    );
    if (!ok) {
      throw new Error(
        `clearText() failed — no onChangeText found on node ${this.descriptor.nodeId} ` +
          `(${this.descriptor.componentType})`,
      );
    }
    this.log(`clearText: ${this.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('clearText', this.label, undefined, start);
  }

  async focus(): Promise<void> {
    const start = Date.now();
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.focus(${this.descriptor.nodeId})`,
    );
    if (!ok) {
      throw new Error(
        `focus() failed — no onFocus or stateNode.focus found on node ${this.descriptor.nodeId}`,
      );
    }
    this.log(`focus: ${this.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('focus', this.label, undefined, start);
  }

  async blur(): Promise<void> {
    const start = Date.now();
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.blur(${this.descriptor.nodeId})`,
    );
    if (!ok) {
      throw new Error(
        `blur() failed — no onBlur or stateNode.blur found on node ${this.descriptor.nodeId}`,
      );
    }
    this.log(`blur: ${this.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('blur', this.label, undefined, start);
  }

  async submitEditing(): Promise<void> {
    const start = Date.now();
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.submitEditing(${this.descriptor.nodeId})`,
    );
    if (!ok) {
      throw new Error(
        `submitEditing() failed — no onSubmitEditing found on node ${this.descriptor.nodeId}`,
      );
    }
    this.log(`submitEditing: ${this.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('submitEditing', this.label, undefined, start);
  }

  async scrollTo(offset: number): Promise<void> {
    const start = Date.now();
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.scrollElement(${this.descriptor.nodeId}, ${offset})`,
    );
    if (!ok) {
      throw new Error(
        `scrollTo() failed — node ${this.descriptor.nodeId} is not a scrollable component`,
      );
    }
    this.log(`scrollTo: ${offset}px on ${this.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('scrollTo', this.label, `${offset}px`, start);
  }

  async swipe(
    direction: 'left' | 'right' | 'up' | 'down',
    distance = 100,
  ): Promise<void> {
    const start = Date.now();
    const result = await this.session.evaluate<boolean | string>(
      `__testBridge__.swipe(${this.descriptor.nodeId}, '${direction}', ${distance})`,
    );
    if (result !== true) {
      throw new Error(
        `swipe('${direction}') failed on node ${this.descriptor.nodeId}: ${result}`,
      );
    }
    this.log(`swipe: ${direction} ${distance}px on ${this.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('swipe', this.label, `${direction} ${distance}px`, start);
  }

  async scrollToX(offset: number): Promise<void> {
    const start = Date.now();
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.scrollElementToX(${this.descriptor.nodeId}, ${offset})`,
    );
    if (!ok) {
      throw new Error(
        `scrollToX() failed — node ${this.descriptor.nodeId} is not a horizontally scrollable component`,
      );
    }
    this.log(`scrollToX: ${offset}px on ${this.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('scrollToX', this.label, `${offset}px`, start);
  }

  async text(): Promise<string> {
    return this.session.evaluate<string>(
      `__testBridge__.getText(${this.descriptor.nodeId})`,
    );
  }

  async inputValue(): Promise<string> {
    return this.session.evaluate<string>(
      `__testBridge__.getInputValue(${this.descriptor.nodeId})`,
    );
  }

  async doubleTap(): Promise<void> {
    const start = Date.now();
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.doubleTap(${this.descriptor.nodeId})`,
    );
    if (!ok) {
      throw new Error(
        `doubleTap() failed — no onPress/onDoublePress found on node ${this.descriptor.nodeId} ` +
          `(${this.descriptor.componentType})`,
      );
    }
    this.log(`doubleTap: ${this.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('doubleTap', this.label, undefined, start);
  }

  async dragTo(target: Element): Promise<void> {
    const start = Date.now();
    const result = await this.session.evaluate<boolean | string>(
      `__testBridge__.dragToElement(${this.descriptor.nodeId}, ${target.nodeId})`,
    );
    if (result !== true) {
      throw new Error(`dragTo() failed on node ${this.descriptor.nodeId}: ${result}`);
    }
    this.log(`dragTo: ${this.label} → ${target.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('dragTo', this.label, `→ ${target.label}`, start);
  }

  async exists(): Promise<boolean> {
    if (!this.descriptor.testID) return false;
    return this.session.evaluate<boolean>(
      `__testBridge__.exists(${JSON.stringify(this.descriptor.testID)})`,
    );
  }

  async isEnabled(): Promise<boolean> {
    return this.session.evaluate<boolean>(
      `__testBridge__.isEnabled(${this.descriptor.nodeId})`,
    );
  }

  async isVisible(): Promise<boolean> {
    return this.exists();
  }

  async isFocused(): Promise<boolean> {
    return this.session.evaluate<boolean>(
      `__testBridge__.isFocused(${this.descriptor.nodeId})`,
    );
  }

  async getFrame(): Promise<Frame | null> {
    return this.session.evaluate<Frame | null>(
      `__testBridge__.getFrame(${this.descriptor.nodeId})`,
    );
  }

  async prop(name: string): Promise<unknown> {
    return (await this.props())[name];
  }

  async pressKey(key: string): Promise<void> {
    const start = Date.now();
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.pressKey(${this.descriptor.nodeId}, ${JSON.stringify(key)})`,
    );
    if (!ok) {
      throw new Error(
        `pressKey('${key}') failed — no onKeyPress found on node ${this.descriptor.nodeId}`,
      );
    }
    this.log(`pressKey: '${key}' → ${this.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('pressKey', this.label, key, start);
  }

  async isChecked(): Promise<boolean> {
    return this.session.evaluate<boolean>(
      `__testBridge__.isChecked(${this.descriptor.nodeId})`,
    );
  }

  async check(): Promise<void> {
    const start = Date.now();
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.setChecked(${this.descriptor.nodeId}, true)`,
    );
    if (!ok) {
      throw new Error(`check() failed — no onValueChange found on node ${this.descriptor.nodeId}`);
    }
    this.log(`check: ${this.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('check', this.label, undefined, start);
  }

  async uncheck(): Promise<void> {
    const start = Date.now();
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.setChecked(${this.descriptor.nodeId}, false)`,
    );
    if (!ok) {
      throw new Error(`uncheck() failed — no onValueChange found on node ${this.descriptor.nodeId}`);
    }
    this.log(`uncheck: ${this.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('uncheck', this.label, undefined, start);
  }

  async selectOption(value: string | number | boolean): Promise<void> {
    const start = Date.now();
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.selectOption(${this.descriptor.nodeId}, ${JSON.stringify(value)})`,
    );
    if (!ok) {
      throw new Error(`selectOption() failed — no onValueChange found on node ${this.descriptor.nodeId}`);
    }
    this.log(`selectOption: ${JSON.stringify(value)} → ${this.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('selectOption', this.label, String(value), start);
  }

  async setDate(date: Date): Promise<void> {
    const start = Date.now();
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.setDateValue(${this.descriptor.nodeId}, ${date.getTime()})`,
    );
    if (!ok) {
      throw new Error(
        `setDate() — no date handler (onDateChange/onChange/onConfirm) found on node ${this.descriptor.nodeId}`,
      );
    }
    this.log(`setDate: ${date.toISOString()} → ${this.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('setDate', this.label, date.toDateString(), start);
  }

  async slideToValue(value: number): Promise<void> {
    const start = Date.now();
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.setSliderValue(${this.descriptor.nodeId}, ${value})`,
    );
    if (!ok) {
      throw new Error(
        `slideToValue() — no onValueChange handler found on node ${this.descriptor.nodeId}`,
      );
    }
    this.log(`slideToValue: ${value} → ${this.label}`);
    if (this.slowDelay > 0) await sleep(this.slowDelay);
    await this.emitStep('slideToValue', this.label, String(value), start);
  }

  async find(selector: Selector): Promise<Element> {
    const start = Date.now();
    const expr = selectorToExpressionWithin(this.descriptor.nodeId, selector);
    const descriptor = await this.session.evaluate<NodeDescriptor | null>(expr);
    if (!descriptor) {
      throw new Error(
        `find() within node ${this.descriptor.nodeId} — not found: ${JSON.stringify(selector)}`,
      );
    }
    this.log(`find: ${selectorLabel(selector)} within ${this.label}`);
    this.tracer?.add({
      action: 'find',
      target: `${selectorLabel(selector)} within ${this.label}`,
      durationMs: Date.now() - start,
      timestampMs: start,
    });
    return new Element(descriptor, this.session, this.verbose, this.slowDelay, this.tracer);
  }

  async findAll(selector: Selector): Promise<Element[]> {
    const start = Date.now();
    const expr = selectorToAllExpressionWithin(this.descriptor.nodeId, selector);
    const descriptors = await this.session.evaluate<NodeDescriptor[]>(expr);
    this.log(`findAll: ${selectorLabel(selector)} within ${this.label} (${descriptors.length} found)`);
    this.tracer?.add({
      action: 'findAll',
      target: `${selectorLabel(selector)} within ${this.label}`,
      value: `${descriptors.length} found`,
      durationMs: Date.now() - start,
      timestampMs: start,
    });
    return descriptors.map(d => new Element(d, this.session, this.verbose, this.slowDelay, this.tracer));
  }

  // ── Tree traversal ────────────────────────────────────────────────────────

  async parent(): Promise<Element> {
    const start = Date.now();
    const descriptor = await this.session.evaluate<NodeDescriptor | null>(
      `__testBridge__.getParent(${this.descriptor.nodeId})`,
    );
    if (!descriptor) {
      throw new Error(`parent() — no meaningful parent found for node ${this.descriptor.nodeId}`);
    }
    this.log(`parent: ${this.label}`);
    this.tracer?.add({ action: 'parent', target: this.label, durationMs: Date.now() - start, timestampMs: start });
    return new Element(descriptor, this.session, this.verbose, this.slowDelay, this.tracer);
  }

  async siblings(): Promise<Element[]> {
    const start = Date.now();
    const descriptors = await this.session.evaluate<NodeDescriptor[]>(
      `__testBridge__.getSiblings(${this.descriptor.nodeId})`,
    );
    this.log(`siblings: ${descriptors.length} found for ${this.label}`);
    this.tracer?.add({ action: 'siblings', target: this.label, value: `${descriptors.length} found`, durationMs: Date.now() - start, timestampMs: start });
    return descriptors.map(d => new Element(d, this.session, this.verbose, this.slowDelay, this.tracer));
  }

  async nextSibling(): Promise<Element | null> {
    const start = Date.now();
    const descriptor = await this.session.evaluate<NodeDescriptor | null>(
      `__testBridge__.getNextSibling(${this.descriptor.nodeId})`,
    );
    if (!descriptor) return null;
    this.log(`nextSibling: ${this.label}`);
    this.tracer?.add({ action: 'nextSibling', target: this.label, durationMs: Date.now() - start, timestampMs: start });
    return new Element(descriptor, this.session, this.verbose, this.slowDelay, this.tracer);
  }

  async prevSibling(): Promise<Element | null> {
    const start = Date.now();
    const descriptor = await this.session.evaluate<NodeDescriptor | null>(
      `__testBridge__.getPreviousSibling(${this.descriptor.nodeId})`,
    );
    if (!descriptor) return null;
    this.log(`prevSibling: ${this.label}`);
    this.tracer?.add({ action: 'prevSibling', target: this.label, durationMs: Date.now() - start, timestampMs: start });
    return new Element(descriptor, this.session, this.verbose, this.slowDelay, this.tracer);
  }

  async closest(selector: Selector): Promise<Element> {
    const start = Date.now();
    const args = selectorToBridgeArgs(this.descriptor.nodeId, selector);
    const descriptor = await this.session.evaluate<NodeDescriptor | null>(
      `__testBridge__.closest(${args})`,
    );
    if (!descriptor) {
      throw new Error(
        `closest(${JSON.stringify(selector)}) — no matching ancestor found for node ${this.descriptor.nodeId}`,
      );
    }
    this.log(`closest: ${selectorLabel(selector)} from ${this.label}`);
    this.tracer?.add({
      action: 'closest',
      target: `${selectorLabel(selector)} from ${this.label}`,
      durationMs: Date.now() - start,
      timestampMs: start,
    });
    return new Element(descriptor, this.session, this.verbose, this.slowDelay, this.tracer);
  }

  async props(): Promise<Record<string, unknown>> {
    return this.session.evaluate<Record<string, unknown>>(`
      (function() {
        var hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
        // Re-find the fiber by testID if available to get fresh memoizedProps
        var testID = ${JSON.stringify(this.descriptor.testID ?? null)};
        var fiber = testID ? (function() {
          var r = null;
          hook.renderers.forEach(function(renderer, id) {
            hook.getFiberRoots(id).forEach(function(root) {
              (function walk(f) {
                if (!f) return;
                if (f.memoizedProps && f.memoizedProps.testID === testID) r = f;
                walk(f.child); walk(f.sibling);
              })(root.current);
            });
          });
          return r;
        })() : null;
        if (!fiber) return {};
        var result = {};
        var p = fiber.memoizedProps || {};
        Object.keys(p).forEach(function(k) {
          var v = p[k];
          var t = typeof v;
          if (t === 'string' || t === 'number' || t === 'boolean' || v === null) {
            result[k] = v;
          }
        });
        // Include accessibilityState for disabled/selected/focused checks
        if (fiber.memoizedProps && fiber.memoizedProps.accessibilityState) {
          result.accessibilityState = fiber.memoizedProps.accessibilityState;
        }
        return result;
      })()
    `);
  }
}
