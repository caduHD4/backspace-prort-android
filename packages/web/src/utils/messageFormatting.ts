/**
 * Message formatting that follows WhatsApp's markers on top of the Markdown the
 * chat already renders.
 *
 *   *text*   bold (CommonMark reads it as italic, so it is rewritten to `**text**`)
 *   _text_   italic   (CommonMark already reads it so)
 *   ~text~   strikethrough (remark-gfm accepts a single tilde)
 *   `text`   inline code, ```block``` code, `> quote`, `- item` and `1. item`
 *            are CommonMark as they stand.
 *
 * `**text**` keeps meaning bold, so messages written in the Discord style do
 * not change. Only a lone `*text*` pair changes meaning, from italic to bold.
 */

/**
 * What the rewrite leaves alone: closed code (fenced, then inline), a fence
 * that never closes (Markdown runs it to the end of the text), and URLs, whose
 * asterisks are part of the address.
 */
const PROTECTED = /(```[\s\S]*?```|`[^`\n]+`|```[\s\S]*$|https?:\/\/[^\s<>]+)/;

/**
 * A lone asterisk pair, with WhatsApp's boundary rules: the opening `*` does
 * not follow a letter, digit, `*` or backslash and is not followed by a space
 * or `*`; the closing `*` follows a non-space and is not followed by a letter,
 * digit or `*`. The text between holds no asterisk and no line break, so
 * `2 * 3 * 4` and a `* item` list line stay as written, and `**bold**` is
 * never matched.
 */
const SINGLE_ASTERISK = /(?<![\p{L}\p{N}*\\])\*(?![\s*])([^*\n]+?)(?<![\s\\])\*(?![\p{L}\p{N}*])/gu;

/** `content` with every lone `*text*` pair written as `**text**`, outside code and URLs. */
export function normalizeWhatsappEmphasis(content: string): string {
  if (!content.includes('*')) return content;
  return content
    .split(PROTECTED)
    .map((segment, index) => (index % 2 === 1 ? segment : segment.replace(SINGLE_ASTERISK, '**$1**')))
    .join('');
}
