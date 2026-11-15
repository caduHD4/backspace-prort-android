import { afterEach, describe, expect, it } from 'vitest';
import { loadNudgeMedia, webNudgeMedia } from './nudgeMedia';

const descriptor = Object.getOwnPropertyDescriptor(window, 'backspace');
afterEach(() => {
  if (descriptor) Object.defineProperty(window, 'backspace', descriptor); else Reflect.deleteProperty(window, 'backspace');
});

describe('browser clips for movie nudges', () => {
  it('bundles the knock clip with the desktop duration', () => {
    const media = webNudgeMedia('knock');
    expect(media?.video).toMatch(/knock.*\.webm/);
    expect(media?.durationMs).toBe(2417);
  });

  it('bundles every MSN wink with the catalog duration', () => {
    const media = webNudgeMedia('msn_fart_guy');
    expect(media?.video).toMatch(/fart_guy.*\.webm/);
    expect(media?.durationMs).toBe(8688);
  });

  it('has no clip for effects that are drawn in the page', () => {
    expect(webNudgeMedia('shake')).toBeNull();
    expect(webNudgeMedia('confetti')).toBeNull();
  });

  it('uses the desktop bridge when one is present', async () => {
    Object.defineProperty(window, 'backspace', { configurable: true, value: { getNudgeMedia: async () => ({ video: 'data:video/webm;base64,AA', durationMs: 5 }) } });
    await expect(loadNudgeMedia('msn_bow')).resolves.toEqual({ video: 'data:video/webm;base64,AA', durationMs: 5 });
  });

  it('falls back to the bundled clip in a browser', async () => {
    Reflect.deleteProperty(window, 'backspace');
    await expect(loadNudgeMedia('msn_bow')).resolves.toEqual(webNudgeMedia('msn_bow'));
  });

  it('treats a failing desktop bridge as no clip', async () => {
    Object.defineProperty(window, 'backspace', { configurable: true, value: { getNudgeMedia: async () => { throw new Error('ipc'); } } });
    await expect(loadNudgeMedia('knock')).resolves.toBeNull();
  });
});
