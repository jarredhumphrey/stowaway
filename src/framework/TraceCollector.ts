export interface TraceStep {
  action: string;
  target?: string;
  value?: string;
  durationMs: number;
  timestampMs: number;
  screenshotPath?: string;
}

export class TraceCollector {
  private _steps: TraceStep[] = [];

  constructor(private screenshotFn: (name: string) => Promise<string>) {}

  add(step: Omit<TraceStep, 'screenshotPath'>): void {
    this._steps.push({ ...step });
  }

  async addWithScreenshot(step: Omit<TraceStep, 'screenshotPath'>): Promise<void> {
    let screenshotPath: string | undefined;
    try {
      screenshotPath = await this.screenshotFn(`trace-${step.action}-${step.timestampMs}`);
    } catch {}
    this._steps.push({ ...step, screenshotPath });
  }

  steps(): TraceStep[] {
    return [...this._steps];
  }

  clear(): void {
    this._steps = [];
  }
}
