import { describe, expect, it } from 'vitest';
import { readSpoilerSelection } from './attachmentSpoilers.js';

const files = [
  { id: 'img', mimetype: 'image/png' },
  { id: 'vid', mimetype: 'video/mp4' },
  { id: 'doc', mimetype: 'application/pdf' },
];

describe('readSpoilerSelection', () => {
  it('treats a missing field as no spoilers', () => {
    expect(readSpoilerSelection(undefined, files)).toEqual([]);
    expect(readSpoilerSelection(null, files)).toEqual([]);
  });

  it('accepts images and videos of the message, once each', () => {
    expect(readSpoilerSelection(['img', 'vid', 'img'], files)).toEqual(['img', 'vid']);
  });

  it('refuses a document, a stranger and a malformed field', () => {
    expect(readSpoilerSelection(['doc'], files)).toBeNull();
    expect(readSpoilerSelection(['other'], files)).toBeNull();
    expect(readSpoilerSelection('img', files)).toBeNull();
    expect(readSpoilerSelection([1], files)).toBeNull();
  });
});
