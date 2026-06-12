export interface TraceStep {
  action: string;
  target?: string;
  value?: string;
  durationMs: number;
  timestampMs: number;
  screenshotPath?: string;
  depth?: number;   // 0 = top-level, 1+ = inside a step() call
  failed?: boolean; // true when this step caused or is part of the failure
}

export class TraceCollector {
  private _steps: TraceStep[] = [];
  private _depth = 0;

  constructor(private screenshotFn: (name: string) => Promise<string>) {}

  // Pre-insert a placeholder slot (used by step() so children appear after the header).
  // Returns the index for later update().
  // Defaults to `failed: true` so that if the step hangs and update() never runs,
  // the entry stays marked failed in the trace (correct attribution on timeout).
  reserve(step: Omit<TraceStep, 'durationMs' | 'screenshotPath'>): number {
    const idx = this._steps.length;
    this._steps.push({ ...step, depth: this._depth, durationMs: 0, failed: true });
    return idx;
  }

  update(idx: number, patch: Partial<TraceStep>): void {
    if (idx >= 0 && idx < this._steps.length) {
      this._steps[idx] = { ...this._steps[idx], ...patch };
    }
  }

  enterStep(): void { this._depth++; }
  exitStep(): void  { this._depth = Math.max(0, this._depth - 1); }

  add(step: Omit<TraceStep, 'screenshotPath'>): void {
    this._steps.push({ ...step, depth: this._depth });
  }

  async addWithScreenshot(step: Omit<TraceStep, 'screenshotPath'>): Promise<void> {
    let screenshotPath: string | undefined;
    try {
      screenshotPath = await this.screenshotFn(`trace-${step.action}-${step.timestampMs}`);
    } catch {}
    this._steps.push({ ...step, depth: this._depth, screenshotPath });
  }

  steps(): TraceStep[] {
    return [...this._steps];
  }

  clear(): void {
    this._steps = [];
    this._depth = 0;
  }
}
