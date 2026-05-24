import { create } from "zustand";

interface AuthModalState {
  open: boolean;
  /** Optional path to redirect to after successful sign-in */
  next: string;
  openModal: (next?: string) => void;
  closeModal: () => void;
}

export const useAuthModalStore = create<AuthModalState>((set) => ({
  open: false,
  next: "/",
  openModal: (next = "/") => set({ open: true, next }),
  closeModal: () => set({ open: false }),
}));
