import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SENSITIVITY,
  HOLD_MS,
  VoiceGate,
  dbToMeterFraction,
  rmsToDb,
  sensitivityToThresholdDb,
} from './voiceGate';

/** Feeds `levelDb` every 20 ms for `ms` milliseconds and returns the time reached and the last answer. */
function feed(gate: VoiceGate, levelDb: number, from: number, ms: number): { now: number; open: boolean } {
  let now = from;
  let open = gate.isOpen;
  for (; now < from + ms; now += 20) open = gate.update(levelDb, now);
  return { now, open };
}

describe('sensitivity', () => {
  it('maps 100 to the lowest threshold and 0 to the highest', () => {
    expect(sensitivityToThresholdDb(100)).toBe(-70);
    expect(sensitivityToThresholdDb(0)).toBe(-10);
    expect(sensitivityToThresholdDb(50)).toBe(-40);
  });

  it('keeps out-of-range values inside the range', () => {
    expect(sensitivityToThresholdDb(150)).toBe(-70);
    expect(sensitivityToThresholdDb(-20)).toBe(-10);
  });
});

describe('levels', () => {
  it('converts RMS to decibels, and silence to -100', () => {
    expect(rmsToDb(1)).toBeCloseTo(0);
    expect(rmsToDb(0.1)).toBeCloseTo(-20);
    expect(rmsToDb(0)).toBe(-100);
  });

  it('places a level on the meter between 0 and 1', () => {
    expect(dbToMeterFraction(-100)).toBe(0);
    expect(dbToMeterFraction(-70)).toBe(0);
    expect(dbToMeterFraction(-35)).toBeCloseTo(0.5);
    expect(dbToMeterFraction(0)).toBe(1);
    expect(dbToMeterFraction(10)).toBe(1);
  });
});

describe('manual gate', () => {
  const manual = (sensitivity: number): VoiceGate => {
    const gate = new VoiceGate();
    gate.configure({ auto: false, sensitivity });
    return gate;
  };

  it('opens above the threshold and stays closed below it', () => {
    const gate = manual(50); // -40 dB
    expect(feed(gate, -50, 0, 400).open).toBe(false);
    expect(feed(gate, -30, 400, 100).open).toBe(true);
  });

  it('holds open through a short pause, then closes', () => {
    const gate = manual(50);
    let { now } = feed(gate, -30, 0, 200);
    ({ now } = feed(gate, -60, now, HOLD_MS - 40));
    expect(gate.isOpen).toBe(true);
    feed(gate, -60, now, 200);
    expect(gate.isOpen).toBe(false);
  });

  it('stays open while the voice trails off just under the threshold', () => {
    const gate = manual(50); // opens above -40, keeps open above -43
    let { now } = feed(gate, -30, 0, 200);
    ({ now } = feed(gate, -42, now, 2000));
    expect(gate.isOpen).toBe(true);
  });

  it('moves with the sensitivity', () => {
    const quiet = manual(90); // -64 dB: a quiet voice opens it
    const loud = manual(10); // -16 dB: only a loud voice does
    expect(feed(quiet, -50, 0, 100).open).toBe(true);
    expect(feed(loud, -50, 0, 100).open).toBe(false);
    expect(DEFAULT_SENSITIVITY).toBeGreaterThan(0);
  });
});

describe('automatic gate', () => {
  it('opens for speech well above the noise of the room', () => {
    const gate = new VoiceGate();
    const { now } = feed(gate, -55, 0, 4000);
    expect(gate.isOpen).toBe(false);
    expect(feed(gate, -25, now, 100).open).toBe(true);
  });

  it('follows a room that stays noisy instead of staying open', () => {
    const gate = new VoiceGate();
    // A fan at -45 dB: the gate may open at first, then must learn it is noise.
    const { now } = feed(gate, -45, 0, 120_000);
    expect(gate.isOpen).toBe(false);
    expect(gate.thresholdDb).toBeGreaterThan(-45);
    // Speech above the fan still opens it.
    expect(feed(gate, -20, now, 100).open).toBe(true);
  });

  it('keeps its threshold inside the allowed range', () => {
    const quiet = new VoiceGate();
    feed(quiet, -100, 0, 10_000);
    expect(quiet.thresholdDb).toBe(-60);
    const loud = new VoiceGate();
    feed(loud, -5, 0, 10_000);
    expect(loud.thresholdDb).toBeLessThanOrEqual(-32);
  });

  it('forgets what it learned on reset', () => {
    const gate = new VoiceGate();
    feed(gate, -45, 0, 60_000);
    gate.reset();
    expect(gate.isOpen).toBe(false);
    expect(gate.thresholdDb).toBe(-50);
  });
});
