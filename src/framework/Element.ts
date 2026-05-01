import type { HermesSession } from './HermesSession';
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

  async tap(): Promise<void> {
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
  }

  async longPress(): Promise<void> {
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
  }

  async typeText(text: string): Promise<void> {
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
  }

  async clearText(): Promise<void> {
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
  }

  async focus(): Promise<void> {
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.focus(${this.descriptor.nodeId})`,
    );
    if (!ok) {
      throw new Error(
        `focus() failed — no onFocus or stateNode.focus found on node ${this.descriptor.nodeId}`,
      );
    }
    this.log(`focus: ${this.label}`);
  }

  async blur(): Promise<void> {
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.blur(${this.descriptor.nodeId})`,
    );
    if (!ok) {
      throw new Error(
        `blur() failed — no onBlur or stateNode.blur found on node ${this.descriptor.nodeId}`,
      );
    }
    this.log(`blur: ${this.label}`);
  }

  async submitEditing(): Promise<void> {
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.submitEditing(${this.descriptor.nodeId})`,
    );
    if (!ok) {
      throw new Error(
        `submitEditing() failed — no onSubmitEditing found on node ${this.descriptor.nodeId}`,
      );
    }
    this.log(`submitEditing: ${this.label}`);
  }

  async scrollTo(offset: number): Promise<void> {
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.scrollElement(${this.descriptor.nodeId}, ${offset})`,
    );
    if (!ok) {
      throw new Error(
        `scrollTo() failed — node ${this.descriptor.nodeId} is not a scrollable component`,
      );
    }
    this.log(`scrollTo: ${offset}px on ${this.label}`);
  }

  async swipe(
    direction: 'left' | 'right' | 'up' | 'down',
    distance = 100,
  ): Promise<void> {
    const result = await this.session.evaluate<boolean | string>(
      `__testBridge__.swipe(${this.descriptor.nodeId}, '${direction}', ${distance})`,
    );
    if (result !== true) {
      throw new Error(
        `swipe('${direction}') failed on node ${this.descriptor.nodeId}: ${result}`,
      );
    }
    this.log(`swipe: ${direction} ${distance}px on ${this.label}`);
  }

  async scrollToX(offset: number): Promise<void> {
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.scrollElementToX(${this.descriptor.nodeId}, ${offset})`,
    );
    if (!ok) {
      throw new Error(
        `scrollToX() failed — node ${this.descriptor.nodeId} is not a horizontally scrollable component`,
      );
    }
    this.log(`scrollToX: ${offset}px on ${this.label}`);
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
  }

  async dragTo(target: Element): Promise<void> {
    // Single bridge call: measure both frames and fire the gesture inside Hermes.
    // Avoids the async getFrame() + CDP awaitPromise round-trip that fails when
    // Fabric's stateNode.measure() defers its callback through native dispatch.
    const result = await this.session.evaluate<boolean | string>(
      `__testBridge__.dragToElement(${this.descriptor.nodeId}, ${target.nodeId})`,
    );
    if (result !== true) {
      throw new Error(`dragTo() failed on node ${this.descriptor.nodeId}: ${result}`);
    }
    this.log(`dragTo: ${this.label} → ${target.label}`);
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
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.pressKey(${this.descriptor.nodeId}, ${JSON.stringify(key)})`,
    );
    if (!ok) {
      throw new Error(
        `pressKey('${key}') failed — no onKeyPress found on node ${this.descriptor.nodeId}`,
      );
    }
    this.log(`pressKey: '${key}' → ${this.label}`);
  }

  async isChecked(): Promise<boolean> {
    return this.session.evaluate<boolean>(
      `__testBridge__.isChecked(${this.descriptor.nodeId})`,
    );
  }

  async check(): Promise<void> {
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.setChecked(${this.descriptor.nodeId}, true)`,
    );
    if (!ok) {
      throw new Error(`check() failed — no onValueChange found on node ${this.descriptor.nodeId}`);
    }
    this.log(`check: ${this.label}`);
  }

  async uncheck(): Promise<void> {
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.setChecked(${this.descriptor.nodeId}, false)`,
    );
    if (!ok) {
      throw new Error(`uncheck() failed — no onValueChange found on node ${this.descriptor.nodeId}`);
    }
    this.log(`uncheck: ${this.label}`);
  }

  async selectOption(value: string | number | boolean): Promise<void> {
    const ok = await this.session.evaluate<boolean>(
      `__testBridge__.selectOption(${this.descriptor.nodeId}, ${JSON.stringify(value)})`,
    );
    if (!ok) {
      throw new Error(`selectOption() failed — no onValueChange found on node ${this.descriptor.nodeId}`);
    }
    this.log(`selectOption: ${JSON.stringify(value)} → ${this.label}`);
  }

  async find(selector: Selector): Promise<Element> {
    const expr = selectorToExpressionWithin(this.descriptor.nodeId, selector);
    const descriptor = await this.session.evaluate<NodeDescriptor | null>(expr);
    if (!descriptor) {
      throw new Error(
        `find() within node ${this.descriptor.nodeId} — not found: ${JSON.stringify(selector)}`,
      );
    }
    this.log(`find: ${selectorLabel(selector)} within ${this.label}`);
    return new Element(descriptor, this.session, this.verbose);
  }

  async findAll(selector: Selector): Promise<Element[]> {
    const expr = selectorToAllExpressionWithin(this.descriptor.nodeId, selector);
    const descriptors = await this.session.evaluate<NodeDescriptor[]>(expr);
    this.log(`findAll: ${selectorLabel(selector)} within ${this.label} (${descriptors.length} found)`);
    return descriptors.map(d => new Element(d, this.session, this.verbose));
  }

  async props(): Promise<Record<string, unknown>> {
    // Serialize only the primitive/serializable memoizedProps of this node.
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
