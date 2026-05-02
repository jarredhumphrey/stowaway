import { execFile as execFileCb } from 'child_process';
import type { ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import type { E2EConfig } from '../config';

const execFile = promisify(execFileCb);

export interface StatusBarOptions {
  time?: string;
  batteryLevel?: number;
  batteryState?: 'charging' | 'discharging' | 'notCharging';
  wifiMode?: 'active' | 'searching' | 'failed' | 'inactive';
  wifiBars?: number;
  cellularMode?: 'active' | 'searching' | 'failed' | 'inactive';
  cellularBars?: number;
  dataNetwork?: 'wifi' | '3g' | '4g' | 'lte' | 'lte-a' | '5g';
  operatorName?: string;
}

interface SimctlDevice {
  udid: string;
  state: string;
  name: string;
}

export class Device {
  private udid: string | null = null;
  private serial: string | null = null;
  private _recordingProcess: ChildProcess | null = null;
  private _recordingPath: string | null = null;
  private _androidRecordingDevicePath: string | null = null;

  constructor(private config: E2EConfig) {}

  // ── iOS ──────────────────────────────────────────────────────────────────

  async getBootedSimulator(): Promise<string> {
    const { stdout } = await execFile('xcrun', ['simctl', 'list', 'devices', '--json']);
    const parsed = JSON.parse(stdout) as { devices: Record<string, SimctlDevice[]> };
    for (const devices of Object.values(parsed.devices)) {
      for (const d of devices) {
        if (d.state === 'Booted') {
          this.udid = d.udid;
          return d.udid;
        }
      }
    }
    throw new Error('No booted iOS simulator found. Run `xcrun simctl boot <udid>` first.');
  }

  async waitForSimulatorBoot(timeoutMs = 30_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        return await this.getBootedSimulator();
      } catch {
        await sleep(500);
      }
    }
    throw new Error('Timed out waiting for iOS simulator to boot');
  }

  async launchIosApp(): Promise<void> {
    const udid = this.udid ?? (await this.getBootedSimulator());
    await execFile('xcrun', ['simctl', 'launch', udid, this.config.bundleId]);
  }

  async terminateIosApp(): Promise<void> {
    const udid = this.udid ?? (await this.getBootedSimulator());
    try {
      await execFile('xcrun', ['simctl', 'terminate', udid, this.config.bundleId]);
    } catch {
      // app may already be dead — not an error
    }
  }

  async screenshotIos(destPath: string): Promise<void> {
    const udid = this.udid ?? (await this.getBootedSimulator());
    await execFile('xcrun', ['simctl', 'io', udid, 'screenshot', destPath]);
  }

  // ── Android ──────────────────────────────────────────────────────────────

  async getBootedEmulator(): Promise<string> {
    const { stdout } = await execFile('adb', ['devices', '-l']);
    const lines = stdout.trim().split('\n').slice(1);
    for (const line of lines) {
      const [serial, state] = line.trim().split(/\s+/);
      if (state === 'device' && serial) {
        this.serial = serial;
        return serial;
      }
    }
    throw new Error('No authorized Android device/emulator found.');
  }

  async ensureAdbReverse(): Promise<void> {
    const port = this.config.metroPort;
    await execFile('adb', this.adb('reverse', `tcp:${port}`, `tcp:${port}`));
  }

  async launchAndroidApp(): Promise<void> {
    await execFile('adb', this.adb(
      'shell', 'monkey',
      '-p', this.config.bundleId,
      '-c', 'android.intent.category.LAUNCHER',
      '1',
    ));
  }

  async terminateAndroidApp(): Promise<void> {
    await execFile('adb', this.adb('shell', 'am', 'force-stop', this.config.bundleId));
  }

  async screenshotAndroid(destPath: string): Promise<void> {
    const { stdout } = await execFile('adb', this.adb('exec-out', 'screencap', '-p'), {
      encoding: 'buffer',
    } as any);
    fs.writeFileSync(destPath, stdout as unknown as Buffer);
  }

  // ── Unified API ───────────────────────────────────────────────────────────

  async launch(): Promise<void> {
    if (this.config.platform === 'ios') {
      await this.launchIosApp();
    } else {
      await this.ensureAdbReverse();
      await this.launchAndroidApp();
    }
  }

  async terminate(): Promise<void> {
    if (this.config.platform === 'ios') {
      await this.terminateIosApp();
    } else {
      await this.terminateAndroidApp();
    }
  }

  async screenshot(destPath: string): Promise<void> {
    if (this.config.platform === 'ios') {
      await this.screenshotIos(destPath);
    } else {
      await this.screenshotAndroid(destPath);
    }
  }

  async init(): Promise<void> {
    if (this.config.platform === 'ios') {
      await this.getBootedSimulator();
    } else {
      await this.getBootedEmulator();
    }
  }

  async pressBack(): Promise<void> {
    if (this.config.platform !== 'android') {
      throw new Error('pressBack() is Android-only');
    }
    await execFile('adb', this.adb('shell', 'input', 'keyevent', '4'));
  }

  async openURL(url: string): Promise<void> {
    if (this.config.platform === 'ios') {
      const udid = this.udid ?? (await this.getBootedSimulator());
      await execFile('xcrun', ['simctl', 'openurl', udid, url]);
    } else {
      await execFile('adb', this.adb(
        'shell', 'am', 'start',
        '-a', 'android.intent.action.VIEW',
        '-d', url,
      ));
    }
  }

  async setLocation(lat: number, lng: number): Promise<void> {
    if (this.config.platform === 'ios') {
      const udid = this.udid ?? (await this.getBootedSimulator());
      await execFile('xcrun', ['simctl', 'location', udid, 'set', `${lat},${lng}`]);
    } else {
      // adb emu geo fix requires the emulator console port; not universally available.
      throw new Error('setLocation() is not yet implemented for Android');
    }
  }

  async setPermission(
    service: string,
    status: 'grant' | 'revoke' | 'reset',
  ): Promise<void> {
    if (this.config.platform === 'ios') {
      const udid = this.udid ?? (await this.getBootedSimulator());
      await execFile('xcrun', ['simctl', 'privacy', udid, status, service]);
    } else {
      const action = status === 'grant' ? 'grant' : 'revoke';
      await execFile('adb', this.adb(
        'shell', 'pm', action,
        this.config.bundleId,
        `android.permission.${service.toUpperCase()}`,
      ));
    }
  }

  // ── Screen recording ─────────────────────────────────────────────────────

  async startRecording(path: string): Promise<void> {
    if (this._recordingProcess) throw new Error('Recording already in progress');
    const { spawn } = await import('child_process');
    if (this.config.platform === 'ios') {
      const udid = this.udid ?? (await this.getBootedSimulator());
      this._recordingProcess = spawn('xcrun', ['simctl', 'io', udid, 'recordVideo', '--codec', 'h264', path]);
    } else {
      this._androidRecordingDevicePath = '/sdcard/stowaway_recording.mp4';
      this._recordingProcess = spawn('adb', this.adb('shell', 'screenrecord', this._androidRecordingDevicePath));
    }
    this._recordingPath = path;
  }

  async stopRecording(): Promise<void> {
    if (!this._recordingProcess) throw new Error('No recording in progress');
    this._recordingProcess.kill('SIGINT');
    await new Promise<void>(resolve => {
      this._recordingProcess!.once('close', () => resolve());
      setTimeout(() => resolve(), 3_000);
    });
    this._recordingProcess = null;
    if (this.config.platform === 'android' && this._androidRecordingDevicePath && this._recordingPath) {
      await new Promise<void>(r => setTimeout(r, 1_000));
      await execFile('adb', this.adb('pull', this._androidRecordingDevicePath, this._recordingPath));
      await execFile('adb', this.adb('shell', 'rm', '-f', this._androidRecordingDevicePath));
      this._androidRecordingDevicePath = null;
    }
    this._recordingPath = null;
  }

  // ── Push notifications ────────────────────────────────────────────────────

  async pushNotification(bundleId: string, payload: object): Promise<void> {
    if (this.config.platform !== 'ios') {
      throw new Error('pushNotification() is only supported on iOS (xcrun simctl push)');
    }
    const udid = this.udid ?? (await this.getBootedSimulator());
    const { writeFileSync, unlinkSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const tmpPath = join(tmpdir(), `stowaway-push-${Date.now()}.json`);
    writeFileSync(tmpPath, JSON.stringify(payload));
    try {
      await execFile('xcrun', ['simctl', 'push', udid, bundleId, tmpPath]);
    } finally {
      try { unlinkSync(tmpPath); } catch {}
    }
  }

  // ── Status bar ────────────────────────────────────────────────────────────

  async setStatusBar(opts: StatusBarOptions): Promise<void> {
    if (this.config.platform !== 'ios') return;
    const udid = this.udid ?? (await this.getBootedSimulator());
    const args = ['simctl', 'status_bar', udid, 'override'];
    if (opts.time !== undefined)         args.push('--time', opts.time);
    if (opts.batteryLevel !== undefined) args.push('--batteryLevel', String(opts.batteryLevel));
    if (opts.batteryState !== undefined) args.push('--batteryState', opts.batteryState);
    if (opts.wifiMode !== undefined)     args.push('--wifiMode', opts.wifiMode);
    if (opts.wifiBars !== undefined)     args.push('--wifiBars', String(opts.wifiBars));
    if (opts.cellularMode !== undefined) args.push('--cellularMode', opts.cellularMode);
    if (opts.cellularBars !== undefined) args.push('--cellularBars', String(opts.cellularBars));
    if (opts.dataNetwork !== undefined)  args.push('--dataNetwork', opts.dataNetwork);
    if (opts.operatorName !== undefined) args.push('--operatorName', opts.operatorName);
    await execFile('xcrun', args);
  }

  async resetStatusBar(): Promise<void> {
    if (this.config.platform !== 'ios') return;
    const udid = this.udid ?? (await this.getBootedSimulator());
    await execFile('xcrun', ['simctl', 'status_bar', udid, 'clear']);
  }

  // ── Clipboard ─────────────────────────────────────────────────────────────

  async setClipboard(text: string): Promise<void> {
    if (this.config.platform !== 'ios') {
      throw new Error('setClipboard() is not supported on Android');
    }
    const { spawn } = await import('child_process');
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('pbcopy');
      proc.stdin.write(text, 'utf8');
      proc.stdin.end();
      proc.once('close', code => code === 0 ? resolve() : reject(new Error(`pbcopy exited with code ${code}`)));
      proc.once('error', reject);
    });
  }

  async getClipboard(): Promise<string> {
    if (this.config.platform !== 'ios') {
      throw new Error('getClipboard() is not supported on Android');
    }
    const { stdout } = await execFile('pbpaste');
    return stdout;
  }

  // Prepend -s <serial> when we know which device to target.
  private adb(...args: string[]): string[] {
    return this.serial ? ['-s', this.serial, ...args] : args;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
