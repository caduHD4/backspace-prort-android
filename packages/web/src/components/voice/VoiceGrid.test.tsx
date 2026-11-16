import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceGrid } from './VoiceGrid';
import { useVoiceStore } from '../../stores/voiceStore';
import { ContextMenuRenderer } from '../ui/ContextMenuRenderer';

vi.mock('../../audio/AudioManager', () => ({
  AudioManager: { getInstance: () => ({}) },
}));

vi.mock('../../hooks/useLiveKit', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getActiveRoom: () => null,
    setCameraSubscription: vi.fn(),
    setStreamSubscription: vi.fn(),
  };
});

function participant(identity: string, isLocal: boolean) {
  return {
    identity,
    userId: identity,
    username: identity,
    homeUserId: null,
    isMuted: false,
    isDeafened: false,
    isCameraOn: false,
    isScreenSharing: false,
    isLocal,
    audioTrack: null,
    videoTrack: null,
    screenTrack: null,
    screenAudioTrack: null,
    lkVideoTrack: null,
    lkScreenTrack: null,
    cachedUser: null,
  } as any;
}

beforeEach(() => {
  useVoiceStore.setState({
    focusedParticipantId: 'ada',
    streamsOnly: false,
    currentVoiceChannelId: 'voice-1',
    isDeafened: false,
    speakingParticipantIds: new Set(),
    spaceMutedUserIds: new Set(),
    spaceDeafenedUserIds: new Set(),
    permissionMutedUserIds: new Set(),
    unwatchedCameras: new Set(),
    participantMutes: new Map(),
  });
});

describe('VoiceGrid participant strip', () => {
  it('can show the participant strip again after hiding it', async () => {
    render(<VoiceGrid participants={[participant('ada', true), participant('bob', false)]} />);

    await userEvent.click(screen.getByText(/hide members/i));
    expect(screen.getByText(/show members/i)).toBeInTheDocument();

    await userEvent.click(screen.getByText(/show members/i));
    expect(screen.getByText(/hide members/i)).toBeInTheDocument();
  });
});

describe('VoiceGrid streams-only filter', () => {
  const streamer = () => ({ ...participant('bob', false), isScreenSharing: true });

  beforeEach(() => {
    useVoiceStore.setState({ focusedParticipantId: null, watchingStreams: new Set() });
  });

  it('offers a checkbox on right-click that hides people without a stream', async () => {
    const { container } = render(
      <>
        <VoiceGrid participants={[participant('ada', true), streamer()]} />
        <ContextMenuRenderer />
      </>,
    );
    expect(screen.getAllByText('ada').length).toBeGreaterThan(0);

    fireEvent.contextMenu(container.firstElementChild as Element);
    const checkbox = await screen.findByRole('menuitemcheckbox', { name: /only streams/i });
    expect(checkbox).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(checkbox);

    expect(useVoiceStore.getState().streamsOnly).toBe(true);
    expect(screen.queryByText('ada')).not.toBeInTheDocument();
    expect(screen.getAllByText(/bob/).length).toBeGreaterThan(0);
  });

  it('says so when nobody is streaming and keeps the menu reachable', async () => {
    useVoiceStore.setState({ streamsOnly: true });
    const { container } = render(
      <>
        <VoiceGrid participants={[participant('ada', true), participant('bob', false)]} />
        <ContextMenuRenderer />
      </>,
    );
    expect(screen.getByText(/no one is streaming/i)).toBeInTheDocument();

    fireEvent.contextMenu(container.firstElementChild as Element);
    const checkbox = await screen.findByRole('menuitemcheckbox', { name: /only streams/i });
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });

  it('drops the focus on a person who gets hidden by the filter', () => {
    useVoiceStore.setState({ streamsOnly: true, focusedParticipantId: 'ada' });
    render(<VoiceGrid participants={[participant('ada', true), streamer()]} />);
    expect(useVoiceStore.getState().focusedParticipantId).toBeNull();
  });
});
