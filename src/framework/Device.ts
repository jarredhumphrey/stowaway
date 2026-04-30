import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import type { E2EConfig } from '../config';

const execFile = promisify(execFileCb);

interface SimctlDevice {
  udid: string;
  state: string;
  name: string;
}

export class Device {
  private udid: string | null = null;
  private serial: string | null = null;

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

  // Prepend -s <serial> when we know which device to target.
  private adb(...args: string[]): string[] {
    return this.serial ? ['-s', this.serial, ...args] : args;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
