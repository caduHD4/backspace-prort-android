import { useTranslation } from 'react-i18next';
import { hasWhatsappFormatting } from '../../utils/messageFormatting';
import { MarkdownRenderer } from './MarkdownRenderer';

interface FormatPreviewProps {
  /** The draft as stored, with `<@id>` mention tokens. */
  content: string;
  channelId: string;
}

/**
 * How the draft will look once sent, shown above the field while it carries
 * formatting. The field itself stays plain text: bold and italic change the
 * width of letters, which would pull the caret away from what is drawn. The
 * preview is the message renderer, so it cannot differ from the result.
 */
export function FormatPreview({ content, channelId }: FormatPreviewProps) {
  const { t } = useTranslation('chat');
  if (!hasWhatsappFormatting(content)) return null;
  return (
    <div className="px-4 pt-2 pb-1 max-h-32 overflow-y-auto border-b border-wash/[0.06]" aria-live="off">
      <div className="text-ui-caption font-semibold uppercase tracking-wide text-txt-tertiary">
        {t('composer.format.preview')}
      </div>
      <div className="text-ui-message text-txt-message break-words">
        <MarkdownRenderer content={content} channelId={channelId} />
      </div>
    </div>
  );
}
