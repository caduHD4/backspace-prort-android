import type { NudgeEffect } from '@backspace/shared';
import catalog from '../../../desktop/resources/nudge-msn/catalog.json';

export interface NudgeMedia { video: string; durationMs: number }

/**
 * The knock clip is not in the MSN catalog: the desktop main process hardcodes
 * its length (`packages/desktop/src/main.ts`, `nudge-media`). Keep both in step.
 */
const KNOCK = { file: 'knock.webm', durationMs: 2417 } as const;

/** The same clips the desktop app plays, bundled as asset URLs by Vite. */
const clipUrls = import.meta.glob<string>('../../../desktop/resources/nudge-msn/*.webm', { eager: true, query: '?url', import: 'default' });

const msnCatalog = catalog as Record<string, { file: string; durationMs: number }>;

/** Clip for a movie effect in a browser, or null for effects that have no clip. */
export function webNudgeMedia(effect: NudgeEffect): NudgeMedia | null {
  const entry = effect === 'knock' ? KNOCK : Object.hasOwn(msnCatalog, effect) ? msnCatalog[effect] : undefined;
  if (!entry) return null;
  const video = clipUrls[`../../../desktop/resources/nudge-msn/${entry.file}`];
  return video ? { video, durationMs: entry.durationMs } : null;
}

/**
 * The desktop app reads its clips through the main process, which keeps the
 * files out of the page. Browsers have no such bridge, so they play the bundled
 * URLs instead; both produce the same clip for the same effect.
 */
export async function loadNudgeMedia(effect: NudgeEffect): Promise<NudgeMedia | null> {
  if (window.backspace?.getNudgeMedia) return window.backspace.getNudgeMedia(effect).catch(() => null);
  return webNudgeMedia(effect);
}
