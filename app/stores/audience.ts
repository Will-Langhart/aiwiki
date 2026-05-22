import { create } from "zustand";
import { persist } from "zustand/middleware";

type Audience = "both" | "technical" | "non_technical";

interface AudienceStore {
  audience: Audience;
  setAudience: (a: Audience) => void;
}

export const useAudienceStore = create<AudienceStore>()(
  persist(
    (set) => ({
      audience: "both",
      setAudience: (audience) => set({ audience }),
    }),
    { name: "audience-pref" }
  )
);
