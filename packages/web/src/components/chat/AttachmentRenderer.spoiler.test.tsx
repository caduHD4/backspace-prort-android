import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Attachment } from '@backspace/shared';
import { useSpoilerStore } from '../../stores/spoilerStore';
import { AttachmentRenderer } from './AttachmentRenderer';

vi.mock('../../audio/AudioManager', () => ({
  AudioManager: { getInstance: vi.fn().mockReturnValue({ setOutputDevice: vi.fn(), setVolume: vi.fn() }) },
}));

function attachment(overrides: Partial<Attachment>): Attachment {
  return {
    id: 'att-1',
    messageId: 'm-1',
    filename: 'photo.png',
    originalName: 'photo.png',
    mimetype: 'image/png',
    size: 1000,
    thumbnailFilename: null,
    width: 100,
    height: 100,
    duration: null,
    createdAt: 1,
    ...overrides,
  };
}

afterEach(() => {
  useSpoilerStore.setState({ revealed: new Set() });
});

describe('AttachmentRenderer spoilers', () => {
  it('covers a spoiler image until it is clicked, then shows it', () => {
    const { container } = render(<AttachmentRenderer attachment={attachment({ spoiler: true })} />);
    expect(screen.getByText('Spoiler')).toBeInTheDocument();
    // The stand-in is decorative: no named image until uncovered.
    expect(screen.queryByAltText('photo.png')).not.toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('alt', '');

    fireEvent.click(screen.getByRole('button', { name: 'Reveal spoiler' }));

    expect(screen.queryByText('Spoiler')).not.toBeInTheDocument();
    expect(screen.getByAltText('photo.png')).toBeInTheDocument();
  });

  it('does not mount a spoiler video until it is clicked', () => {
    const { container } = render(
      <AttachmentRenderer attachment={attachment({ spoiler: true, mimetype: 'video/mp4', filename: 'clip.mp4', originalName: 'clip.mp4' })} />,
    );
    expect(container.querySelector('video')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Reveal spoiler' }));

    expect(container.querySelector('video')).not.toBeNull();
  });

  it('shows an ordinary attachment as it is', () => {
    render(<AttachmentRenderer attachment={attachment({})} />);
    expect(screen.queryByText('Spoiler')).not.toBeInTheDocument();
    expect(screen.getByAltText('photo.png')).toBeInTheDocument();
  });

  it('ignores the mark on a file that is not an image or a video', () => {
    render(
      <AttachmentRenderer attachment={attachment({ spoiler: true, mimetype: 'application/pdf', filename: 'a.pdf', originalName: 'a.pdf' })} />,
    );
    expect(screen.queryByText('Spoiler')).not.toBeInTheDocument();
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
  });
});
