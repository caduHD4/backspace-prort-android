import { describe, expect, it } from 'vitest';
import { windowCaptureMode } from './windowCapturePolicy';

describe('windowCaptureMode', () => {
  it('crops on Windows 10 to avoid the capture border', () => {
    expect(windowCaptureMode('win32', '10.0.19045')).toBe('crop');
  });
  it('captures the window natively from Windows 11', () => {
    expect(windowCaptureMode('win32', '10.0.22000')).toBe('native');
    expect(windowCaptureMode('win32', '10.0.26100')).toBe('native');
  });
  it('falls back to the crop path when the build cannot be read', () => {
    expect(windowCaptureMode('win32', 'garbage')).toBe('crop');
  });
  it('lets the override pick either path and ignores other values', () => {
    expect(windowCaptureMode('win32', '10.0.26100', 'crop')).toBe('crop');
    expect(windowCaptureMode('win32', '10.0.19045', 'native')).toBe('native');
    expect(windowCaptureMode('win32', '10.0.26100', 'x')).toBe('native');
  });
  it('is native off Windows', () => {
    expect(windowCaptureMode('linux', '6.1.0')).toBe('native');
  });
});
