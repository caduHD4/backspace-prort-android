import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface SpoilerCoverProps {
  /** A stand-in for the media (a thumbnail, or nothing), drawn blurred behind the badge. */
  children?: ReactNode;
  onReveal: () => void;
}

/**
 * Covers an image or a video the sender marked as a spoiler: the media is
 * blurred and a badge says so, and one click or key press uncovers it. The
 * stand-in is decorative, so it is hidden from assistive technology and takes
 * no pointer events.
 */
export function SpoilerCover({ children, onReveal }: SpoilerCoverProps) {
  const { t } = useTranslation('chat');
  return (
    <div className="relative w-full h-full min-h-[96px] overflow-hidden bg-surface-input">
      <div aria-hidden="true" className="w-full h-full blur-2xl scale-110 pointer-events-none select-none">
        {children}
      </div>
      <button
        type="button"
        onClick={onReveal}
        aria-label={t('attachment.spoiler.reveal')}
        className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/20 transition-colors cursor-pointer"
      >
        <span className="glass-pill px-3 py-1 text-ui-caption font-semibold uppercase tracking-wide text-txt-primary">
          {t('attachment.spoiler.label')}
        </span>
      </button>
    </div>
  );
}
