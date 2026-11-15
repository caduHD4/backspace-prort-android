import { canBeSpoiler } from '@backspace/shared/src/constants';

/**
 * Reads the `spoilerAttachments` of a message send: the ids, among the
 * message's own `attachments`, that the sender marked as spoilers.
 *
 * Returns the distinct ids, or null when the field is not usable: not an
 * array of strings, naming a file that is not part of this message, or naming
 * a file that is not an image or a video. A missing field is no spoilers.
 */
export function readSpoilerSelection(
  raw: unknown,
  attachments: ReadonlyArray<{ id: string; mimetype: string }>,
): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || !raw.every((id): id is string => typeof id === 'string')) return null;
  const byId = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  const ids = [...new Set(raw)];
  for (const id of ids) {
    const attachment = byId.get(id);
    if (!attachment || !canBeSpoiler(attachment.mimetype)) return null;
  }
  return ids;
}
