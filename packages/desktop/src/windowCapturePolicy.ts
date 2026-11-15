/**
 * How a single-window share is captured on Windows.
 *
 * `native`: Chromium captures the window itself (Windows Graphics Capture). It
 * follows the window across monitors, is not affected by what covers it, and
 * costs one window-sized texture instead of a whole display decoded and
 * cropped every frame. Windows 11 draws no capture border for it, which is the
 * reason the display-capture-and-crop path exists on Windows 10.
 *
 * `crop`: capture the display the window is on and crop it (the borderless
 * workaround for Windows 10). A display capture goes black while a game holds
 * exclusive fullscreen and on some hybrid-GPU / multi-monitor setups, which is
 * what Windows 11 users hit.
 */
export type WindowCaptureMode = 'native' | 'crop';

/** First Windows 11 build (21H2). */
export const WINDOWS_11_BUILD = 22000;

/**
 * @param systemVersion `process.getSystemVersion()`: `10.0.<build>` on Windows.
 * @param override `BACKSPACE_WINDOW_CAPTURE` (`native` | `crop`), for comparing
 *   both paths on one machine. Anything else is ignored.
 */
export function windowCaptureMode(
  platform: NodeJS.Platform,
  systemVersion: string,
  override?: string,
): WindowCaptureMode {
  if (platform !== 'win32') return 'native';
  if (override === 'native' || override === 'crop') return override;
  const build = Number(/^\d+\.\d+\.(\d+)/.exec(systemVersion.trim())?.[1]);
  return Number.isFinite(build) && build >= WINDOWS_11_BUILD ? 'native' : 'crop';
}
