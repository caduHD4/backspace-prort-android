import { describe, expect, it } from 'vitest';
import { hasFormat, inlineFormatForKey, toggleBlock, toggleFormat, toggleInline } from './composerFormatting';

/** Applies the edit to `text` with `[` and `]` marking the selection, and returns the result the same way. */
function run(marked: string, format: Parameters<typeof toggleFormat>[3]): string {
  const start = marked.indexOf('[');
  const end = marked.indexOf(']') - 1;
  const text = marked.replace('[', '').replace(']', '');
  const edit = toggleFormat(text, start, end, format);
  return edit.value.slice(0, edit.start) + '[' + edit.value.slice(edit.start, edit.end) + ']' + edit.value.slice(edit.end);
}

describe('inline formats', () => {
  it('wraps the selection with the WhatsApp marker', () => {
    expect(run('diga [oi] já', 'bold')).toBe('diga *[oi]* já');
    expect(run('diga [oi] já', 'italic')).toBe('diga _[oi]_ já');
    expect(run('diga [oi] já', 'strike')).toBe('diga ~[oi]~ já');
    expect(run('diga [oi] já', 'code')).toBe('diga `[oi]` já');
  });

  it('removes the marker when it surrounds the selection or sits inside it', () => {
    expect(run('diga *[oi]* já', 'bold')).toBe('diga [oi] já');
    expect(run('diga [*oi*] já', 'bold')).toBe('diga [oi] já');
    expect(run('diga **[oi]** já', 'bold')).toBe('diga [oi] já');
  });

  it('keeps white space out of the markers', () => {
    expect(run('[ oi ]', 'bold')).toBe(' *[oi]* ');
  });

  it('nests formats', () => {
    expect(run('*[oi]*', 'italic')).toBe('*_[oi]_*');
  });

  it('formats each line on its own and removes from all together', () => {
    expect(run('[um\ndois]', 'bold')).toBe('[*um*\n*dois*]');
    expect(run('[*um*\n*dois*]', 'bold')).toBe('[um\ndois]');
    expect(run('[*um*\ndois]', 'bold')).toBe('[*um*\n*dois*]');
  });

  it('writes an empty pair at a caret', () => {
    const edit = toggleInline('ab', 1, 1, 'bold');
    expect(edit).toEqual({ value: 'a**b', start: 2, end: 2 });
  });

  it('does nothing for a selection of white space', () => {
    expect(toggleInline('a   b', 1, 4, 'bold')).toEqual({ value: 'a   b', start: 1, end: 4 });
  });

  it('fences inline code around backticks', () => {
    expect(run('[a`b]', 'code')).toBe('`` [a`b] ``');
  });

  it('reports the format a selection carries', () => {
    expect(hasFormat('*oi*', 1, 3, 'bold')).toBe(true);
    expect(hasFormat('*oi*', 1, 3, 'italic')).toBe(false);
    expect(hasFormat('oi', 0, 2, 'bold')).toBe(false);
  });

  it('maps typed marker keys', () => {
    expect(inlineFormatForKey('*')).toBe('bold');
    expect(inlineFormatForKey('_')).toBe('italic');
    expect(inlineFormatForKey('~')).toBe('strike');
    expect(inlineFormatForKey('`')).toBe('code');
    expect(inlineFormatForKey('a')).toBeNull();
  });
});

describe('block formats', () => {
  it('quotes and unquotes the lines touched', () => {
    expect(run('a\n[b\nc]\nd', 'quote')).toBe('a\n[> b\n> c]\nd');
    expect(run('a\n[> b\n> c]\nd', 'quote')).toBe('a\n[b\nc]\nd');
  });

  it('makes bullet and numbered lists, skipping blank lines in the count', () => {
    expect(run('[a\n\nb]', 'bullet')).toBe('[- a\n\n- b]');
    expect(run('[a\n\nb]', 'numbered')).toBe('[1. a\n\n2. b]');
  });

  it('switches a list kind without stacking markers', () => {
    expect(run('[- a\n- b]', 'numbered')).toBe('[1. a\n2. b]');
    expect(run('[1. a\n2. b]', 'bullet')).toBe('[- a\n- b]');
  });

  it('moves the caret with the marker on a collapsed line', () => {
    expect(toggleBlock('ola', 3, 3, 'bullet')).toEqual({ value: '- ola', start: 5, end: 5 });
    expect(toggleBlock('', 0, 0, 'quote')).toEqual({ value: '> ', start: 2, end: 2 });
  });

  it('fences and unfences a code block', () => {
    expect(run('a\n[b\nc]\nd', 'codeBlock')).toBe('a\n```\n[b\nc]\n```\nd');
    expect(run('a\n```\n[b\nc]\n```\nd', 'codeBlock')).toBe('a\n[b\nc]\nd');
    expect(toggleBlock('', 0, 0, 'codeBlock')).toEqual({ value: '```\n\n```', start: 4, end: 4 });
  });

  it('reports block formats', () => {
    expect(hasFormat('> a', 0, 3, 'quote')).toBe(true);
    expect(hasFormat('a', 0, 1, 'quote')).toBe(false);
    expect(hasFormat('- a', 0, 3, 'numbered')).toBe(false);
    expect(hasFormat('```\na\n```', 4, 5, 'codeBlock')).toBe(true);
  });
});
