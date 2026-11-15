import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoiceStore } from '../../../stores/voiceStore';
import { AudioManager } from '../../../audio/AudioManager';
import { useAudioDevices } from '../../../hooks/useAudioDevices';
import { SectionShell, DropdownItem } from './_shared/SettingsPickerPrimitives';
import { Toggle } from '../../ui/Toggle';
import { dbToMeterFraction } from '../../../audio/voiceGate';

export function AudioInputSection() {
  const { t } = useTranslation(['settings', 'common']);
  const inputDeviceId = useVoiceStore((s) => s.inputDeviceId);
  const setInputDevice = useVoiceStore((s) => s.setInputDevice);
  const inputVolume = useVoiceStore((s) => s.inputVolume);
  const setInputVolume = useVoiceStore((s) => s.setInputVolume);
  const sensitivityAuto = useVoiceStore((s) => s.inputSensitivityAuto);
  const setSensitivityAuto = useVoiceStore((s) => s.setInputSensitivityAuto);
  const sensitivity = useVoiceStore((s) => s.inputSensitivity);
  const setSensitivity = useVoiceStore((s) => s.setInputSensitivity);
  const { permState, inputs, inputLabels, requestPermission } = useAudioDevices();

  const [listOpen, setListOpen] = useState(false);
  // What the voice gate reads from the microphone: the level, the level that opens it, and whether it is open.
  const [gate, setGate] = useState({ levelDb: -100, thresholdDb: -45, open: false });
  const [activeUpstreamId, setActiveUpstreamId] = useState<string | null>(null);
  // Bumped whenever AudioManager's AudioContext transitions to 'running'.
  // Used as a dep on effects that need to re-run once the context exists —
  // the user may open Settings before joining voice (no AudioContext yet),
  // then join voice and expect the meter / resolved-default hint to come
  // alive without reopening the panel.
  const [audioCtxGen, setAudioCtxGen] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  // Click-outside-to-close. iOS Safari does not synthesize `mousedown` from
  // touch reliably, so we listen for `touchstart` alongside `mousedown` to
  // make the popover dismissable with a single tap on touch devices.
  useEffect(() => {
    if (!listOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setListOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [listOpen]);

  // Listen for AudioContext resume events so dependent effects re-trigger
  // when the context first becomes available (e.g. user joins voice after
  // opening Settings). onResumed fires on every 'running' state transition;
  // we only need an opaque generation bump to re-run downstream effects.
  useEffect(() => {
    if (permState !== 'granted') return;
    const am = AudioManager.getInstance();
    const unsubscribe = am.onResumed(() => setAudioCtxGen((g) => g + 1));
    return () => { unsubscribe(); };
  }, [permState]);

  // Live mic-level meter. Reads the voice gate's own measurement, the one
  // that decides what is sent, so the bars and the threshold mark agree with
  // what the gate does. No extra getUserMedia is needed once the user is in
  // voice. Re-runs on `audioCtxGen` bumps so the meter activates after the
  // AudioContext appears mid-session.
  useEffect(() => {
    if (permState !== 'granted') return;
    let stopped = false;
    const am = AudioManager.getInstance();
    const ctx = am.getContext();
    if (!ctx) return; // nothing to measure until the user joins voice or hits Test
    const tick = () => {
      if (stopped) return;
      setGate(am.getVoiceGateState());
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      stopped = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [permState, audioCtxGen]);

  // Track the resolved upstream deviceId for the "Currently using: X" hint.
  // Re-runs on `audioCtxGen` because the resolved-default ID is only known
  // after AudioManager has actually opened a stream.
  useEffect(() => {
    if (permState !== 'granted') return;
    const am = AudioManager.getInstance();
    const id = am.getCurrentInputDeviceId();
    setActiveUpstreamId(id === 'default' ? null : id);
  }, [permState, inputDeviceId, audioCtxGen]);

  if (permState === 'unknown') {
    return (
      <SectionShell title={t('voice.input.title')}>
        <div className="text-sm text-txt-tertiary">{t('voice.input.checkingAccess')}</div>
      </SectionShell>
    );
  }

  if (permState === 'denied') {
    return (
      <SectionShell title={t('voice.input.title')}>
        <div className="space-y-2">
          <div className="text-sm text-txt-primary">⚠ {t('voice.input.accessDenied.title')}</div>
          <div className="text-xs text-txt-tertiary">
            {t('voice.input.accessDenied.description')}
          </div>
          <button data-icon-motion="press"
            onClick={() => { requestPermission().catch(() => {}); }}
            className="text-xs px-3 py-1.5 rounded-md bg-surface-base hover:bg-interactive-hover text-txt-secondary transition-colors"
          >
            {t('voice.input.accessDenied.retry')}
          </button>
        </div>
      </SectionShell>
    );
  }

  if (permState === 'prompt') {
    return (
      <SectionShell title={t('voice.input.title')}>
        <div className="space-y-3">
          <div className="text-xs text-txt-tertiary">
            {t('voice.input.permissionPrompt.description')}
          </div>
          <button data-icon-motion="press"
            onClick={() => { requestPermission().catch(() => {}); }}
            className="ui-button ui-button-primary transition-colors"
          >
            {t('voice.input.permissionPrompt.enable')}
          </button>
        </div>
      </SectionShell>
    );
  }

  // permState === 'granted'
  const systemDefaultLabel = t('voice.input.device.systemDefault');
  const selectedLabel = inputDeviceId === 'default'
    ? systemDefaultLabel
    : inputLabels.get(inputDeviceId) ?? systemDefaultLabel;
  const resolvedHint = inputDeviceId === 'default' && activeUpstreamId
    ? inputLabels.get(activeUpstreamId)
    : null;

  const handleSelect = (id: string) => {
    setInputDevice(id);
    AudioManager.getInstance().setInputDevice(id).catch(() => {});
    setListOpen(false);
  };

  const micBars = 20;
  const activeBars = Math.round(dbToMeterFraction(gate.levelDb) * micBars);
  const thresholdPercent = dbToMeterFraction(gate.thresholdDb) * 100;

  return (
    <SectionShell title={t('voice.input.title')}>
      <div className="space-y-3">
        <div ref={dropdownRef}>
          <button data-icon-motion="press"
            type="button"
            onClick={() => setListOpen((v) => !v)}
            className="w-full px-3 py-2 flex items-center justify-between rounded-md bg-surface-base hover:bg-interactive-hover transition-colors"
          >
            <span className="text-ui-label text-txt-primary truncate text-left">{selectedLabel}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
              className={`text-txt-tertiary flex-shrink-0 ml-2 transition-transform ${listOpen ? 'rotate-90' : ''}`}>
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            </svg>
          </button>
          {listOpen && (
            <div className="mt-1 rounded-md bg-surface-base border border-border-hard py-1 max-h-64 overflow-y-auto">
              <DropdownItem label={systemDefaultLabel} active={inputDeviceId === 'default'} onClick={() => handleSelect('default')} />
              {inputs.filter(d => d.deviceId !== 'default').map((d) => (
                <DropdownItem
                  key={d.deviceId}
                  label={inputLabels.get(d.deviceId) ?? d.deviceId}
                  active={inputDeviceId === d.deviceId}
                  onClick={() => handleSelect(d.deviceId)}
                />
              ))}
            </div>
          )}
        </div>
        {resolvedHint && (
          <div className="text-xs text-txt-tertiary -mt-1">{t('voice.input.device.currentlyUsing', { label: resolvedHint })}</div>
        )}
        {inputs.length === 0 && (
          <div className="text-xs text-txt-tertiary">{t('voice.input.device.none')}</div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-ui-label font-medium text-txt-primary">{t('voice.input.volume.label')}</div>
            <div className="text-xs text-txt-tertiary tabular-nums">{t('common:units.percent', { value: inputVolume })}</div>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            value={inputVolume}
            onChange={(e) => setInputVolume(Number(e.target.value))}
            className="ui-range"
            style={{
              background: `linear-gradient(to right, rgb(var(--accent-primary)) 0%, rgb(var(--accent-primary)) ${inputVolume / 2}%, rgb(var(--interactive-muted)) ${inputVolume / 2}%, rgb(var(--interactive-muted)) 100%)`,
            }}
          />
          <div className="text-xs text-txt-tertiary mt-1.5">
            {t('voice.input.meter.hint')}
          </div>
        </div>

        <div>
          <div className="text-ui-label font-medium text-txt-primary">{t('voice.input.sensitivity.label')}</div>
          <div className="flex items-center justify-between gap-3 mt-1.5">
            <span className="text-ui-label text-txt-secondary min-w-0">{t('voice.input.sensitivity.auto')}</span>
            <Toggle
              enabled={sensitivityAuto}
              onChange={setSensitivityAuto}
              ariaLabel={t('voice.input.sensitivity.auto')}
            />
          </div>

          {/* The meter shows the level the gate reads; the mark is where it opens. */}
          <div className="relative mt-2">
            <div className="flex items-center gap-[3px]" aria-hidden="true">
              {Array.from({ length: micBars }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-[6px] rounded-[1px] transition-colors duration-75 ${
                    i < activeBars ? (gate.open ? 'bg-status-online' : 'bg-accent-amber') : 'bg-interactive-muted'
                  }`}
                />
              ))}
            </div>
            <div
              aria-hidden="true"
              className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-txt-primary pointer-events-none"
              style={{ left: `calc(${thresholdPercent}% - 1px)` }}
            />
          </div>

          <input
            type="range"
            min={0}
            max={100}
            value={sensitivity}
            disabled={sensitivityAuto}
            aria-label={t('voice.input.sensitivity.label')}
            onChange={(e) => setSensitivity(Number(e.target.value))}
            className={`ui-range mt-3 ${sensitivityAuto ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={{
              background: `linear-gradient(to right, rgb(var(--accent-primary)) 0%, rgb(var(--accent-primary)) ${sensitivity}%, rgb(var(--interactive-muted)) ${sensitivity}%, rgb(var(--interactive-muted)) 100%)`,
            }}
          />
          <div className="flex items-center justify-between text-xs text-txt-tertiary mt-1">
            <span>{t('voice.input.sensitivity.lower')}</span>
            <span>{t('voice.input.sensitivity.higher')}</span>
          </div>
          <div className="text-xs text-txt-tertiary mt-1.5">
            {sensitivityAuto ? t('voice.input.sensitivity.hintAuto') : t('voice.input.sensitivity.hintManual')}
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
