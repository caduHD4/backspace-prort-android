import { create } from 'zustand';

/**
 * The spoiler attachments this session has uncovered. A spoiler is drawn
 * blurred until its viewer clicks it; the choice lasts for the session only,
 * so reloading covers it again. Keyed by attachment id, which the message
 * list's recycling of rows does not change.
 */
interface SpoilerStore {
  revealed: ReadonlySet<string>;
  reveal: (attachmentId: string) => void;
}

export const useSpoilerStore = create<SpoilerStore>((set) => ({
  revealed: new Set<string>(),
  reveal: (attachmentId) => set((state) => {
    if (state.revealed.has(attachmentId)) return state;
    const revealed = new Set(state.revealed);
    revealed.add(attachmentId);
    return { revealed };
  }),
}));
