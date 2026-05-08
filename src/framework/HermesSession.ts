import type { E2EConfig } from '../config';

interface PageDescriptor {
  id: string;
  title?: string;
  webSocketDebuggerUrl: string;
}

interface CdpResponse {
  id?: number;
  method?: string;
  result?: Record<string, unknown>;
  params?: Record<string, unknown>;
  error?: { message: string };
}

export class HermesSession {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pendingCalls = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();
  private bindingListeners = new Map<string, Set<(payload: string) => void>>();
  private executionContextId: number | undefined;
  private _disconnecting = false;

  constructor(private config: E2EConfig) {}

  async connect(webSocketDebuggerUrl: string): Promise<void> {
    await this.openSocket(webSocketDebuggerUrl);
    await this.send('Runtime.enable', {});
    // Wait briefly for executionContextCreated event; fall back gracefully.
    await new Promise<void>(resolve => setTimeout(resolve, 800));
  }

  async disconnect(): Promise<void> {
    this._disconnecting = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.executionContextId = undefined;
      this.pendingCalls.clear();
      this.bindingListeners.clear();
    }
    this._disconnecting = false;
  }

  async addBinding(name: string, handler: (payload: string) => void): Promise<void> {
    if (!this.bindingListeners.has(name)) {
      await this.send('Runtime.addBinding', { name });
      this.bindingListeners.set(name, new Set());
    }
    this.bindingListeners.get(name)!.add(handler);
  }

  removeBindingListener(name: string, handler: (payload: string) => void): void {
    this.bindingListeners.get(name)?.delete(handler);
  }

  async evaluate<T>(expression: string): Promise<T> {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      ...(this.executionContextId !== undefined
        ? { contextId: this.executionContextId }
        : {}),
    }) as {
      result: { value: unknown };
      exceptionDetails?: { exception?: { description?: string }; text?: string };
    };

    if (result.exceptionDetails) {
      const msg =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        'Unknown JS exception';
      throw new Error(`JS evaluation error: ${msg}`);
    }

    return result.result.value as T;
  }

  // Returns all available CDP targets. Polls until at least one appears.
  async waitForMetroTargets(timeoutMs = 60_000): Promise<PageDescriptor[]> {
    const url = `http://localhost:${this.config.metroPort}/json`;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const pages = (await res.json()) as PageDescriptor[];
          const targets = pages.filter(p => p.webSocketDebuggerUrl);
          if (targets.length > 0) return targets;
        }
      } catch {
        // Metro not up yet
      }
      await sleep(500);
    }

    throw new Error(
      `Timed out waiting for Metro CDP targets at ${url}. ` +
        'Ensure `expo run:ios` (or :android) is running.',
    );
  }

  private openSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onmessage = (event: MessageEvent) => {
        let msg: CdpResponse;
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          return;
        }

        // Handle events
        if (!msg.id && msg.method === 'Runtime.executionContextCreated') {
          const ctx = (msg.params as any)?.context;
          if (ctx?.id !== undefined) this.executionContextId = ctx.id;
          return;
        }

        if (!msg.id && msg.method === 'Runtime.bindingCalled') {
          const { name, payload } = msg.params as { name: string; payload: string };
          for (const fn of this.bindingListeners.get(name) ?? []) fn(payload);
          return;
        }

        // Handle responses to our requests
        if (msg.id !== undefined) {
          const pending = this.pendingCalls.get(msg.id);
          if (!pending) return;
          this.pendingCalls.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error.message));
          } else {
            pending.resolve(msg.result ?? {});
          }
        }
      };

      ws.onopen = () => resolve();
      ws.onerror = (e: Event) => reject(new Error(`WebSocket error: ${String(e)}`));
      ws.onclose = () => {
        const msg = this._disconnecting
          ? 'WebSocket closed'
          : 'CDP connection lost — the app may have crashed (call isAppRunning() to confirm)';
        for (const p of this.pendingCalls.values()) {
          p.reject(new Error(msg));
        }
        this.pendingCalls.clear();
      };
    });
  }

  private send(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.ws) throw new Error('HermesSession: not connected');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pendingCalls.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ id, method, params }));
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
