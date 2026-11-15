import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComposerFormat } from '../../utils/composerFormatting';

interface FormatToolbarProps {
  /** Formats the selection already carries; their buttons show pressed and remove the format. */
  active: ReadonlySet<ComposerFormat>;
  onApply: (format: ComposerFormat) => void;
}

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

const ICON_PROPS = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

const BUTTONS: ReadonlyArray<{ format: ComposerFormat; icon: ReactNode; shortcut?: string }> = [
  { format: 'bold', shortcut: `${MOD}B`, icon: <span className="font-bold text-ui-body">B</span> },
  { format: 'italic', shortcut: `${MOD}I`, icon: <span className="italic font-serif text-ui-body">I</span> },
  { format: 'strike', shortcut: `${MOD}Shift+X`, icon: <span className="line-through text-ui-body">S</span> },
  { format: 'code', shortcut: `${MOD}E`, icon: <svg {...ICON_PROPS}><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" /></svg> },
  { format: 'codeBlock', icon: <svg {...ICON_PROPS}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 10l-2 2 2 2M15 10l2 2-2 2" /></svg> },
  { format: 'quote', icon: <svg {...ICON_PROPS}><path d="M4 5v14M9 8h11M9 12h11M9 16h7" /></svg> },
  { format: 'bullet', icon: <svg {...ICON_PROPS}><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></svg> },
  { format: 'numbered', icon: <svg {...ICON_PROPS}><path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v4M3.5 14h3l-3 3h3" /></svg> },
];

/**
 * The formatting bar that shows above the composer while text is selected.
 * Pressing a button must not take focus from the textarea, or the selection
 * it acts on would collapse.
 */
export function FormatToolbar({ active, onApply }: FormatToolbarProps) {
  const { t } = useTranslation('chat');
  return (
    <div
      role="toolbar"
      aria-label={t('composer.format.toolbar')}
      className="glass absolute bottom-full left-2 mb-2 z-20 flex items-center gap-0.5 rounded-lg p-1 max-w-[calc(100%-1rem)] overflow-x-auto"
      onMouseDown={(event) => event.preventDefault()}
    >
      {BUTTONS.map(({ format, icon, shortcut }) => {
        const label = t(`composer.format.${format}`);
        const pressed = active.has(format);
        return (
          <button
            key={format}
            type="button"
            aria-label={label}
            aria-pressed={pressed}
            title={shortcut ? `${label} (${shortcut})` : label}
            onClick={() => onApply(format)}
            className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-md transition-colors ${
              pressed ? 'bg-accent-primary/20 text-accent-primary' : 'text-txt-secondary hover:text-txt-primary hover:bg-interactive-hover'
            }`}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}
