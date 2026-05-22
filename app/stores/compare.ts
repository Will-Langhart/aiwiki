import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CompareItem {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
}

interface CompareStore {
  items: CompareItem[];
  isOpen: boolean;
  add: (item: CompareItem) => void;
  remove: (id: string) => void;
  toggle: (item: CompareItem) => void;
  clear: () => void;
  setOpen: (open: boolean) => void;
}

export const useCompareStore = create<CompareStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      add: (item) => {
        if (get().items.length >= 4) return; // max 4 comparisons
        if (get().items.some((i) => i.id === item.id)) return;
        set((s) => ({ items: [...s.items, item] }));
      },
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      toggle: (item) => {
        const exists = get().items.some((i) => i.id === item.id);
        if (exists) {
          get().remove(item.id);
        } else {
          get().add(item);
        }
      },
      clear: () => set({ items: [] }),
      setOpen: (isOpen) => set({ isOpen }),
    }),
    { name: "compare-tray" }
  )
);
