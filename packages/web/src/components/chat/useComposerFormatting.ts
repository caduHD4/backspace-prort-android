import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { ComposerMentions } from './composerMentions';
import {
  BLOCK_FORMATS,
  INLINE_FORMATS,
  hasFormat,
  inlineFormatForKey,
  toggleFormat,
  type ComposerFormat,
} from '../../utils/composerFormatting';

interface Options {
  channelId: string;
  textareaRef: RefObject<HTMLTextAreaElement>;
  /** The draft as stored, with `<@id>` tokens. */
  draftText: string;
  mentionModel: ComposerMentions;
  modelFor: (value: string) => ComposerMentions;
  setDraft: (channelId: string, value: string) => void;
}

interface DisplaySelection {
  start: number;
  end: number;
}

/**
 * WhatsApp-style formatting for the composer: the selection the toolbar acts
 * on, the formats it already carries, applying a format, and the keyboard
 * routes to it (Ctrl/Cmd+B, I, E, Shift+X, and typing a marker over a
 * selection to wrap it).
 *
 * The textarea shows mentions by name while the draft keeps `<@id>` tokens,
 * so the edit runs on the draft with offsets mapped through `mentionModel`;
 * a selection touching a mention covers its whole token.
 */
export function useComposerFormatting({ channelId, textareaRef, draftText, mentionModel, modelFor, setDraft }: Options) {
  const [selection, setSelection] = useState<DisplaySelection | null>(null);
  const pendingSelection = useRef<DisplaySelection | null>(null);

  useEffect(() => {
    const read = (): void => {
      const textarea = textareaRef.current;
      const next = textarea && document.activeElement === textarea && textarea.selectionStart !== textarea.selectionEnd
        ? { start: textarea.selectionStart, end: textarea.selectionEnd }
        : null;
      setSelection((current) => (current?.start === next?.start && current?.end === next?.end ? current : next));
    };
    document.addEventListener('selectionchange', read);
    return () => document.removeEventListener('selectionchange', read);
  }, [textareaRef]);

  // The textarea takes the new text on the render the draft change causes;
  // the selection to restore is set right after it.
  useLayoutEffect(() => {
    const pending = pendingSelection.current;
    const textarea = textareaRef.current;
    if (!pending || !textarea) return;
    pendingSelection.current = null;
    textarea.focus();
    textarea.setSelectionRange(pending.start, pending.end);
    // `selectionchange` may not fire for a programmatic range, so the toolbar is told directly.
    setSelection(pending.start === pending.end ? null : pending);
  }, [draftText, textareaRef]);

  const wireRange = useCallback((range: DisplaySelection): DisplaySelection => ({
    start: mentionModel.toWire(range.start),
    end: range.start === range.end ? mentionModel.toWire(range.start) : mentionModel.toWire(range.end, true),
  }), [mentionModel]);

  const active = useMemo(() => {
    const formats = new Set<ComposerFormat>();
    if (!selection) return formats;
    const range = wireRange(selection);
    for (const format of [...INLINE_FORMATS, ...BLOCK_FORMATS]) {
      if (hasFormat(draftText, range.start, range.end, format)) formats.add(format);
    }
    return formats;
  }, [selection, draftText, wireRange]);

  const apply = useCallback((format: ComposerFormat): void => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const range = wireRange({ start: textarea.selectionStart, end: textarea.selectionEnd });
    const edit = toggleFormat(draftText, range.start, range.end, format);
    const next = modelFor(edit.value);
    pendingSelection.current = { start: next.toDisplay(edit.start), end: next.toDisplay(edit.end) };
    if (edit.value === draftText) {
      textarea.setSelectionRange(pendingSelection.current.start, pendingSelection.current.end);
      setSelection(pendingSelection.current.start === pendingSelection.current.end ? null : pendingSelection.current);
      pendingSelection.current = null;
      return;
    }
    setDraft(channelId, edit.value);
  }, [textareaRef, wireRange, draftText, modelFor, setDraft, channelId]);

  /** Handles a formatting key; true when it did, so the caller stops processing the event. */
  const handleFormatKey = useCallback((event: KeyboardEvent): boolean => {
    const textarea = textareaRef.current;
    if (!textarea || event.altKey) return false;
    let format: ComposerFormat | null = null;
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (!event.shiftKey && key === 'b') format = 'bold';
      else if (!event.shiftKey && key === 'i') format = 'italic';
      else if (!event.shiftKey && key === 'e') format = 'code';
      else if (event.shiftKey && key === 'x') format = 'strike';
    } else if (textarea.selectionStart !== textarea.selectionEnd) {
      format = inlineFormatForKey(event.key);
    }
    if (!format) return false;
    event.preventDefault();
    apply(format);
    return true;
  }, [textareaRef, apply]);

  return { selection, active, apply, handleFormatKey };
}
