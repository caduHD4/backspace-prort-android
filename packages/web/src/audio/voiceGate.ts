/**
 * The voice gate: decides, from the level of the microphone, whether what the
 * microphone hears is being spoken and should be sent.
 *
 * It is pure so it can be tested without audio. `AudioManager` feeds it one
 * level reading at a time and opens or closes the gain in front of the
 * published track from the answer.
 *
 * Two ways to set where "speech" starts:
 *  - manual: a sensitivity from 0 to 100 picks a fixed threshold in decibels
 *    (100 is the most sensitive, 0 the least);
 *  - automatic: the gate follows the noise of the room and opens a margin
 *    above it, so a fan or a keyboard that stays on does not open it.
 */

/** Levels are decibels relative to full scale (0 dB is the loudest a signal can be). */
export const MIN_THRESHOLD_DB = -70;
export const MAX_THRESHOLD_DB = -10;
/** The lowest level the meter draws; anything quieter reads as silence. */
export const METER_MIN_DB = -70;

export const DEFAULT_SENSITIVITY = 60;

/** How long the gate stays open after the voice drops below the threshold. */
export const HOLD_MS = 300;
/** The gate stays open down to this far below the threshold it opened at, so a word trailing off does not flutter it. */
const HYSTERESIS_DB = 3;

/** Automatic mode opens this far above the tracked noise floor. */
const AUTO_MARGIN_DB = 10;
/** The automatic threshold never leaves this range: a silent room still needs a real voice, a loud one still opens for a loud voice. */
const AUTO_MIN_DB = -60;
const AUTO_MAX_DB = -32;
const INITIAL_FLOOR_DB = -60;

/** Per reading: how fast the floor follows a lower level, a higher level while the gate is closed, and one while it is open. */
const FLOOR_FALL = 0.3;
const FLOOR_RISE_CLOSED = 0.004;
const FLOOR_RISE_OPEN = 0.0003;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** The threshold a sensitivity from 0 to 100 stands for: 100 is the lowest threshold, the most sensitive. */
export function sensitivityToThresholdDb(sensitivity: number): number {
  const fraction = clamp(sensitivity, 0, 100) / 100;
  return MAX_THRESHOLD_DB - fraction * (MAX_THRESHOLD_DB - MIN_THRESHOLD_DB);
}

/** Decibels for a linear RMS between 0 and 1. A silent signal reads as -100. */
export function rmsToDb(rms: number): number {
  return rms <= 1e-5 ? -100 : 20 * Math.log10(rms);
}

/** Where a level sits on the meter, from 0 (silence) to 1 (full scale). */
export function dbToMeterFraction(db: number): number {
  return clamp((db - METER_MIN_DB) / -METER_MIN_DB, 0, 1);
}

export interface VoiceGateSettings {
  auto: boolean;
  /** 0 to 100, used when `auto` is off. */
  sensitivity: number;
}

export class VoiceGate {
  private auto = true;
  private manualThresholdDb = sensitivityToThresholdDb(DEFAULT_SENSITIVITY);
  private floorDb = INITIAL_FLOOR_DB;
  private open = false;
  private lastActiveAt = 0;

  configure(settings: VoiceGateSettings): void {
    this.auto = settings.auto;
    this.manualThresholdDb = sensitivityToThresholdDb(settings.sensitivity);
  }

  /** The level the voice has to pass to open the gate right now. */
  get thresholdDb(): number {
    return this.auto
      ? clamp(this.floorDb + AUTO_MARGIN_DB, AUTO_MIN_DB, AUTO_MAX_DB)
      : this.manualThresholdDb;
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Forget what the gate learned, as when the microphone changes. */
  reset(): void {
    this.floorDb = INITIAL_FLOOR_DB;
    this.open = false;
    this.lastActiveAt = 0;
  }

  /**
   * Takes one level reading, in decibels, taken at `now` (milliseconds), and
   * returns whether the gate is open after it.
   */
  update(levelDb: number, now: number): boolean {
    if (levelDb < this.floorDb) this.floorDb += (levelDb - this.floorDb) * FLOOR_FALL;
    else this.floorDb += (levelDb - this.floorDb) * (this.open ? FLOOR_RISE_OPEN : FLOOR_RISE_CLOSED);

    const threshold = this.thresholdDb;
    if (!this.open) {
      if (levelDb > threshold) {
        this.open = true;
        this.lastActiveAt = now;
      }
    } else if (levelDb > threshold - HYSTERESIS_DB) {
      this.lastActiveAt = now;
    } else if (now - this.lastActiveAt > HOLD_MS) {
      this.open = false;
    }
    return this.open;
  }
}
