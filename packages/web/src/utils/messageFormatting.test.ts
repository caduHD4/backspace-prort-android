import { describe, expect, it } from 'vitest';
import { hasWhatsappFormatting, normalizeWhatsappEmphasis } from './messageFormatting';

describe('normalizeWhatsappEmphasis', () => {
  it('turns *text* into bold', () => {
    expect(normalizeWhatsappEmphasis('*oi*')).toBe('**oi**');
    expect(normalizeWhatsappEmphasis('diga *oi* para todos')).toBe('diga **oi** para todos');
    expect(normalizeWhatsappEmphasis('*um* e *dois*')).toBe('**um** e **dois**');
  });

  it('keeps **bold** and ***both*** as written', () => {
    expect(normalizeWhatsappEmphasis('**oi**')).toBe('**oi**');
    expect(normalizeWhatsappEmphasis('***oi***')).toBe('***oi***');
  });

  it('does not touch arithmetic, list markers or unpaired asterisks', () => {
    expect(normalizeWhatsappEmphasis('2 * 3 * 4')).toBe('2 * 3 * 4');
    expect(normalizeWhatsappEmphasis('2*3*4')).toBe('2*3*4');
    expect(normalizeWhatsappEmphasis('* item\n* outro')).toBe('* item\n* outro');
    expect(normalizeWhatsappEmphasis('so um * aqui')).toBe('so um * aqui');
    expect(normalizeWhatsappEmphasis('*')).toBe('*');
  });

  it('does not cross a line break', () => {
    expect(normalizeWhatsappEmphasis('*a\nb*')).toBe('*a\nb*');
  });

  it('leaves code and URLs alone', () => {
    expect(normalizeWhatsappEmphasis('`*oi*`')).toBe('`*oi*`');
    expect(normalizeWhatsappEmphasis('```\n*oi*\n```')).toBe('```\n*oi*\n```');
    expect(normalizeWhatsappEmphasis('```\n*oi*')).toBe('```\n*oi*');
    expect(normalizeWhatsappEmphasis('https://x.com/*a*/b *c*')).toBe('https://x.com/*a*/b **c**');
    expect(normalizeWhatsappEmphasis('*a* `*b*` *c*')).toBe('**a** `*b*` **c**');
  });

  it('respects an escaped asterisk', () => {
    expect(normalizeWhatsappEmphasis('\\*oi\\*')).toBe('\\*oi\\*');
  });

  it('nests with italic and strikethrough', () => {
    expect(normalizeWhatsappEmphasis('*_oi_*')).toBe('**_oi_**');
    expect(normalizeWhatsappEmphasis('_*oi*_')).toBe('_**oi**_');
    expect(normalizeWhatsappEmphasis('~*oi*~')).toBe('~**oi**~');
  });

  it('handles accented text and punctuation boundaries', () => {
    expect(normalizeWhatsappEmphasis('(*olá*)')).toBe('(**olá**)');
    expect(normalizeWhatsappEmphasis('*ação!*')).toBe('**ação!**');
  });
});

describe('hasWhatsappFormatting', () => {
  it('sees marker pairs, code, quotes and lists', () => {
    for (const text of ['_teste_', 'diga *oi* já', '~riscado~', '`x`', '```\ncodigo\n```', '> citação', '- item', '1. item', '**negrito**']) {
      expect(hasWhatsappFormatting(text), text).toBe(true);
    }
  });

  it('ignores plain text, unpaired markers and words with underscores', () => {
    for (const text of ['oi', 'só um * aqui', '_teste', 'snake_case_name', '2 * 3 * 4', 'a -b', '']) {
      expect(hasWhatsappFormatting(text), text).toBe(false);
    }
  });
});
