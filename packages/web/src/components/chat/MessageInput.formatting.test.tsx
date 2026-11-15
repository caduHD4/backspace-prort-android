import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@backspace/shared';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { useComposerStore } from '../../stores/composerStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { useUIStore } from '../../stores/uiStore';
import { MessageInput } from './MessageInput';

vi.mock('../../hooks/useWebSocket', () => ({ wsSend: vi.fn() }));
vi.mock('../../audio/AudioManager', () => ({
  AudioManager: { getInstance: vi.fn().mockReturnValue({ setOutputDevice: vi.fn(), setVolume: vi.fn() }) },
}));

const me = {
  id: 'me', username: 'alice', displayName: 'Alice', avatar: null, banner: null, accentColor: null,
  avatarColor: null, bio: null, status: 'online', customStatus: null, isAdmin: false, createdAt: 1,
  homeInstance: null, homeUserId: null, replicatedInstances: [],
} as User;

const draft = () => useComposerStore.getState().get('chan-1').draftText;

/** Types `value` into the composer and selects `start..end`, as a user dragging over the text would. */
function selectText(value: string, start: number, end: number): HTMLTextAreaElement {
  const textbox = screen.getByRole('textbox') as HTMLTextAreaElement;
  fireEvent.change(textbox, { target: { value } });
  textbox.focus();
  act(() => {
    textbox.setSelectionRange(start, end);
    document.dispatchEvent(new Event('selectionchange'));
  });
  return textbox;
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  useAuthStore.setState({ user: me });
  useUIStore.setState({ isMobile: false });
  useComposerStore.setState({ states: new Map() });
  useSpaceStore.setState({
    channelToSpaceMap: new Map([['chan-1', 'space-1']]),
    channelPermissions: new Map([['chan-1', '1024']]),
    members: [],
    currentSpaceId: 'space-1',
  });
});

afterEach(() => {
  useChatStore.getState().clearAllMessages();
  useComposerStore.setState({ states: new Map() });
  useSpaceStore.setState({ channelToSpaceMap: new Map(), channelPermissions: new Map(), currentSpaceId: null });
  useAuthStore.setState({ user: null });
});

describe('MessageInput formatting', () => {
  it('shows the toolbar only while text is selected', () => {
    render(<MessageInput channelId="chan-1" channelName="general" />);
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    selectText('diga oi', 5, 7);
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  it('applies and removes a format from the toolbar', () => {
    render(<MessageInput channelId="chan-1" channelName="general" />);
    selectText('diga oi', 5, 7);

    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(draft()).toBe('diga *oi*');
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(draft()).toBe('diga oi');
  });

  it('wraps the selection when a marker is typed over it', () => {
    render(<MessageInput channelId="chan-1" channelName="general" />);
    const textbox = selectText('diga oi', 5, 7);

    fireEvent.keyDown(textbox, { key: '_' });
    expect(draft()).toBe('diga _oi_');
  });

  it('formats with the keyboard shortcut', () => {
    render(<MessageInput channelId="chan-1" channelName="general" />);
    const textbox = selectText('diga oi', 5, 7);

    fireEvent.keyDown(textbox, { key: 'b', ctrlKey: true });
    expect(draft()).toBe('diga *oi*');
  });

  it('turns a selected line into a quote', () => {
    render(<MessageInput channelId="chan-1" channelName="general" />);
    selectText('diga oi', 5, 7);

    fireEvent.click(screen.getByRole('button', { name: 'Quote' }));
    expect(draft()).toBe('> diga oi');
  });
});
