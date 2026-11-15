import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceStore } from '../../../stores/voiceStore';
import { AudioInputSection } from './AudioInputSection';

const setVoiceGate = vi.fn();

vi.mock('../../../audio/AudioManager', () => ({
  AudioManager: {
    getInstance: () => ({
      setVoiceGate,
      setInputVolume: vi.fn(),
      setInputDevice: vi.fn().mockResolvedValue(null),
      onResumed: () => () => {},
      getContext: () => null,
      getCurrentInputDeviceId: () => 'default',
      getVoiceGateState: () => ({ levelDb: -100, thresholdDb: -45, open: false }),
    }),
  },
}));

vi.mock('../../../hooks/useAudioDevices', () => ({
  useAudioDevices: () => ({
    permState: 'granted',
    inputs: [],
    inputLabels: new Map(),
    requestPermission: vi.fn(),
  }),
}));

beforeEach(() => {
  setVoiceGate.mockClear();
  useVoiceStore.setState({ inputSensitivityAuto: true, inputSensitivity: 60 });
});

afterEach(() => {
  useVoiceStore.setState({ inputSensitivityAuto: true, inputSensitivity: 60 });
});

describe('AudioInputSection input sensitivity', () => {
  it('starts automatic, with the slider off', () => {
    render(<AudioInputSection />);
    expect(screen.getByRole('switch', { name: 'Automatically determine input sensitivity' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('slider', { name: 'Input sensitivity' })).toBeDisabled();
  });

  it('turns automatic off, which frees the slider and tells the gate', () => {
    render(<AudioInputSection />);

    fireEvent.click(screen.getByRole('switch', { name: 'Automatically determine input sensitivity' }));

    expect(useVoiceStore.getState().inputSensitivityAuto).toBe(false);
    expect(setVoiceGate).toHaveBeenLastCalledWith({ auto: false, sensitivity: 60 });
    expect(screen.getByRole('slider', { name: 'Input sensitivity' })).not.toBeDisabled();
  });

  it('sets the sensitivity from the slider', () => {
    useVoiceStore.setState({ inputSensitivityAuto: false });
    render(<AudioInputSection />);

    fireEvent.change(screen.getByRole('slider', { name: 'Input sensitivity' }), { target: { value: '85' } });

    expect(useVoiceStore.getState().inputSensitivity).toBe(85);
    expect(setVoiceGate).toHaveBeenLastCalledWith({ auto: false, sensitivity: 85 });
  });

  it('keeps the sensitivity inside 0 to 100', () => {
    useVoiceStore.getState().setInputSensitivity(250);
    expect(useVoiceStore.getState().inputSensitivity).toBe(100);
    useVoiceStore.getState().setInputSensitivity(-5);
    expect(useVoiceStore.getState().inputSensitivity).toBe(0);
  });
});
