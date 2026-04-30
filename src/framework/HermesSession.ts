import type { E2EConfig } from '../config';

interface PageDescriptor {
  id: string;
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
  private executionContextId: number | undefined;

  constructor(private config: E2EConfig) {}

  async connect(): Promise<void> {
    const descriptor = await this.waitForMetroTarget();
    await this.openSocket(descriptor.webSocketDebuggerUrl);
    await this.send('Runtime.enable', {});

    // Wait briefly for executionContextCreated event; fall back gracefully.
    await new Promise<void>(resolve => setTimeout(resolve, 800));
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.executionContextId = undefined;
      this.pendingCalls.clear();
    }
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
        for (const p of this.pendingCalls.values()) {
          p.reject(new Error('WebSocket closed'));
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

  async waitForMetroTarget(timeoutMs = 60_000): Promise<PageDescriptor> {
    const url = `http://localhost:${this.config.metroPort}/json`;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const pages = (await res.json()) as PageDescriptor[];
          const target = pages.find(p => p.webSocketDebuggerUrl);
          if (target) return target;
        }
      } catch {
        // Metro not up yet
      }
      await sleep(500);
    }

    throw new Error(
      `Timed out waiting for Metro CDP target at ${url}. ` +
        'Ensure `expo run:ios` (or :android) is running.',
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
