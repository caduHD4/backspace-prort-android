/**
 * Edits that apply WhatsApp-style formatting to the composer's draft.
 *
 * Every function is pure and works on the draft as stored (the wire text, with
 * `<@id>` mention tokens), with offsets into that text. It returns the new
 * text and the selection to restore, so the caller only maps the offsets to
 * and from what the textarea shows. How the markers render is in
 * `messageFormatting.ts`.
 */

export type InlineFormat = 'bold' | 'italic' | 'strike' | 'code';
export type BlockFormat = 'codeBlock' | 'quote' | 'bullet' | 'numbered';
export type ComposerFormat = InlineFormat | BlockFormat;

export const INLINE_FORMATS: readonly InlineFormat[] = ['bold', 'italic', 'strike', 'code'];
export const BLOCK_FORMATS: readonly BlockFormat[] = ['codeBlock', 'quote', 'bullet', 'numbered'];

export interface TextEdit {
  value: string;
  start: number;
  end: number;
}

/** The marker written for each inline format. */
const WRITE_MARKER: Record<InlineFormat, string> = { bold: '*', italic: '_', strike: '~', code: '`' };

/** Markers that already mean the format, longest first (`**x**` is bold as well as `*x*`). */
const READ_MARKERS: Record<InlineFormat, readonly string[]> = {
  bold: ['**', '*'],
  italic: ['_'],
  strike: ['~~', '~'],
  code: ['`'],
};

/** The marker character an inline format is typed with, for wrapping a selection by typing it. */
export function inlineFormatForKey(key: string): InlineFormat | null {
  switch (key) {
    case '*': return 'bold';
    case '_': return 'italic';
    case '~': return 'strike';
    case '`': return 'code';
    default: return null;
  }
}

interface Segment {
  start: number;
  end: number;
}

/**
 * The non-blank text of each line in `start..end`, without the white space at
 * its edges. A marker pair never spans a line break, so each line is its own
 * segment.
 */
function inlineSegments(value: string, start: number, end: number): Segment[] {
  const segments: Segment[] = [];
  let lineStart = start;
  while (lineStart <= end) {
    const newline = value.indexOf('\n', lineStart);
    const lineEnd = newline === -1 || newline > end ? end : newline;
    let s = lineStart;
    let e = lineEnd;
    while (s < e && /\s/.test(value[s]!)) s++;
    while (e > s && /\s/.test(value[e - 1]!)) e--;
    if (e > s) segments.push({ start: s, end: e });
    if (newline === -1 || newline >= end) break;
    lineStart = newline + 1;
  }
  return segments;
}

/** How a segment already carries a format: markers just outside it, or at its two edges. */
type InlineState = { where: 'outer' | 'inner'; marker: string } | null;

function inlineState(value: string, segment: Segment, format: InlineFormat): InlineState {
  const text = value.slice(segment.start, segment.end);
  for (const marker of READ_MARKERS[format]) {
    if (value.slice(segment.start - marker.length, segment.start) === marker
      && value.slice(segment.end, segment.end + marker.length) === marker) {
      return { where: 'outer', marker };
    }
  }
  for (const marker of READ_MARKERS[format]) {
    if (text.length > 2 * marker.length && text.startsWith(marker) && text.endsWith(marker)) {
      return { where: 'inner', marker };
    }
  }
  return null;
}

/** The marker to write around `text`: inline code needs a fence longer than any backtick run inside. */
function markerFor(format: InlineFormat, text: string): { open: string; close: string } {
  if (format !== 'code') return { open: WRITE_MARKER[format], close: WRITE_MARKER[format] };
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longestRun + 1);
  return longestRun > 0 ? { open: fence + ' ', close: ' ' + fence } : { open: fence, close: fence };
}

/** What editing one segment left: its text bounds, and the bounds with the markers that still wrap it. */
interface SegmentEdit extends TextEdit {
  extentStart: number;
  extentEnd: number;
}

/**
 * Wraps or unwraps one segment. When wrapping, a segment that already carries
 * the format is left as it is, so a mixed selection never doubles a marker.
 */
function editSegment(value: string, segment: Segment, format: InlineFormat, unwrap: boolean): SegmentEdit {
  const text = value.slice(segment.start, segment.end);
  const state = inlineState(value, segment, format);
  if (unwrap && state?.where === 'outer') {
    const { marker } = state;
    const start = segment.start - marker.length;
    const end = segment.end - marker.length;
    return {
      value: value.slice(0, start) + text + value.slice(segment.end + marker.length),
      start, end, extentStart: start, extentEnd: end,
    };
  }
  if (unwrap && state?.where === 'inner') {
    const { marker } = state;
    const end = segment.end - 2 * marker.length;
    return {
      value: value.slice(0, segment.start) + text.slice(marker.length, -marker.length) + value.slice(segment.end),
      start: segment.start, end, extentStart: segment.start, extentEnd: end,
    };
  }
  if (state) {
    const outer = state.where === 'outer' ? state.marker.length : 0;
    return {
      value, start: segment.start, end: segment.end,
      extentStart: segment.start - outer, extentEnd: segment.end + outer,
    };
  }
  const { open, close } = markerFor(format, text);
  return {
    value: value.slice(0, segment.start) + open + text + close + value.slice(segment.end),
    start: segment.start + open.length,
    end: segment.end + open.length,
    extentStart: segment.start,
    extentEnd: segment.end + open.length + close.length,
  };
}

/**
 * Applies or removes an inline format on `start..end`. With a caret and no
 * selection it writes an empty pair and puts the caret inside. Each line of a
 * selection is formatted on its own; when every line already carries the
 * format it is removed from all of them. A single line stays selected inside
 * its markers; several lines stay selected whole, markers included, so the
 * same command undoes them.
 */
export function toggleInline(value: string, start: number, end: number, format: InlineFormat): TextEdit {
  if (start === end) {
    const { open, close } = markerFor(format, '');
    return {
      value: value.slice(0, start) + open + close + value.slice(end),
      start: start + open.length,
      end: start + open.length,
    };
  }
  const segments = inlineSegments(value, start, end);
  if (segments.length === 0) return { value, start, end };
  const unwrap = segments.every((segment) => inlineState(value, segment, format) !== null);
  let next = value;
  const results: SegmentEdit[] = [];
  const deltas: number[] = [];
  // Last line first, so the offsets of the lines still to edit stay valid.
  for (let i = segments.length - 1; i >= 0; i--) {
    const before = next.length;
    const edit = editSegment(next, segments[i]!, format, unwrap);
    results.unshift(edit);
    deltas.unshift(edit.value.length - before);
    next = edit.value;
  }
  // The last line's bounds were taken before the lines above it changed length.
  const earlierShift = deltas.slice(0, -1).reduce((sum, delta) => sum + delta, 0);
  const first = results[0]!;
  const last = results[results.length - 1]!;
  if (results.length === 1) return { value: next, start: first.start, end: first.end };
  return { value: next, start: first.extentStart, end: last.extentEnd + earlierShift };
}

// ─── Block formats ─────────────────────────────────────────────────────────

const QUOTE_PREFIX = /^> ?/;
const BULLET_PREFIX = /^[-*•] /;
const NUMBER_PREFIX = /^\d+\. /;

interface LineRange {
  /** Start of the first line touched. */
  from: number;
  /** End of the last line touched, before its line break. */
  to: number;
  lines: string[];
}

function lineRange(value: string, start: number, end: number): LineRange {
  const from = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  const reach = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const newline = value.indexOf('\n', reach);
  const to = newline === -1 ? value.length : newline;
  return { from, to, lines: value.slice(from, to).split('\n') };
}

/** The lines a block format acts on: the filled ones, or every line when all are blank. */
function targetIndexes(lines: readonly string[]): number[] {
  const filled = lines.flatMap((line, i) => (line.trim() === '' ? [] : [i]));
  return filled.length > 0 ? filled : lines.map((_, i) => i);
}

function listPrefix(format: 'bullet' | 'numbered'): RegExp {
  return format === 'bullet' ? BULLET_PREFIX : NUMBER_PREFIX;
}

/** The fenced block whose content is `range`, when the lines around it are the fences. */
function surroundingFence(value: string, range: LineRange): { open: number; close: number } | null {
  if (range.from === 0 || range.to >= value.length) return null;
  const open = range.from === 1 ? 0 : value.lastIndexOf('\n', range.from - 2) + 1;
  if (!value.slice(open, range.from - 1).startsWith('```')) return null;
  const closeBreak = value.indexOf('\n', range.to + 1);
  const close = closeBreak === -1 ? value.length : closeBreak;
  if (value.slice(range.to + 1, close).trim() !== '```') return null;
  return { open, close };
}

/** Whether `start..end` already carries `format`; drives the toolbar's pressed state. */
export function hasFormat(value: string, start: number, end: number, format: ComposerFormat): boolean {
  if (format === 'codeBlock') {
    const range = lineRange(value, start, end);
    return surroundingFence(value, range) !== null;
  }
  if (format === 'quote' || format === 'bullet' || format === 'numbered') {
    const { lines } = lineRange(value, start, end);
    const targets = targetIndexes(lines);
    const prefix = format === 'quote' ? QUOTE_PREFIX : listPrefix(format);
    return targets.every((i) => prefix.test(lines[i]!)) && lines.some((line) => line.trim() !== '');
  }
  const segments = inlineSegments(value, start, end);
  return segments.length > 0 && segments.every((segment) => inlineState(value, segment, format) !== null);
}

/** Applies or removes a block format on the lines `start..end` touches. */
export function toggleBlock(value: string, start: number, end: number, format: BlockFormat): TextEdit {
  const range = lineRange(value, start, end);
  const content = range.lines.join('\n');

  if (format === 'codeBlock') {
    const fence = surroundingFence(value, range);
    if (fence) {
      return {
        value: value.slice(0, fence.open) + content + value.slice(fence.close),
        start: fence.open,
        end: fence.open + content.length,
      };
    }
    return {
      value: value.slice(0, range.from) + '```\n' + content + '\n```' + value.slice(range.to),
      start: range.from + 4,
      end: range.from + 4 + content.length,
    };
  }

  const prefix = format === 'quote' ? QUOTE_PREFIX : listPrefix(format);
  const targets = targetIndexes(range.lines);
  const remove = hasFormat(value, start, end, format);
  let number = 0;
  const lines = range.lines.map((line, i) => {
    if (!targets.includes(i)) return line;
    if (remove) return line.replace(prefix, '');
    // A line switching list kind loses its old marker first.
    const bare = format === 'quote' ? line.replace(QUOTE_PREFIX, '') : line.replace(BULLET_PREFIX, '').replace(NUMBER_PREFIX, '');
    if (format === 'quote') return '> ' + bare;
    if (format === 'bullet') return '- ' + bare;
    number += 1;
    return `${number}. ${bare}`;
  });
  const next = lines.join('\n');
  const value2 = value.slice(0, range.from) + next + value.slice(range.to);
  if (start === end) {
    const shift = lines[0]!.length - range.lines[0]!.length;
    const caret = Math.max(range.from, start + shift);
    return { value: value2, start: caret, end: caret };
  }
  return { value: value2, start: range.from, end: range.from + next.length };
}

/** Applies or removes `format` on `start..end`. */
export function toggleFormat(value: string, start: number, end: number, format: ComposerFormat): TextEdit {
  return (INLINE_FORMATS as readonly string[]).includes(format)
    ? toggleInline(value, start, end, format as InlineFormat)
    : toggleBlock(value, start, end, format as BlockFormat);
}
