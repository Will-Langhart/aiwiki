import { create } from "zustand";
import type { PricingTier, AudienceFit } from "@/types/domain";

export interface DraftData {
  // Step 1 — Basics
  website_url: string;
  name: string;
  tagline: string;
  slug: string;
  primary_category_id: string;
  secondary_category_ids: string[];
  tag_ids: string[];
  // Step 2 — Description
  overview_md: string;
  docs_intro_md: string;
  use_cases_md: string;
  // Step 3 — Structured facts
  pricing_tier: PricingTier;
  has_free_tier: boolean;
  pricing_starts_at: number | null;
  audience_fit: AudienceFit;
  model_provider: string;
  open_source: boolean;
  self_hostable: boolean;
  api_available: boolean;
  founded_year: string;
  hq_country: string;
  hq_city: string;
  key_strengths: string[];
  // Step 4 — Screenshots (storage paths after upload)
  screenshots: Array<{
    storage_path: string;
    public_url: string;
    alt_text: string;
    caption: string;
  }>;
}

export const DRAFT_DATA_DEFAULTS: DraftData = {
  website_url: "",
  name: "",
  tagline: "",
  slug: "",
  primary_category_id: "",
  secondary_category_ids: [],
  tag_ids: [],
  overview_md: "",
  docs_intro_md: "",
  use_cases_md: "",
  pricing_tier: "freemium",
  has_free_tier: false,
  pricing_starts_at: null,
  audience_fit: "both",
  model_provider: "",
  open_source: false,
  self_hostable: false,
  api_available: false,
  founded_year: "",
  hq_country: "",
  hq_city: "",
  key_strengths: [],
  screenshots: [],
};

interface SubmissionStore {
  draftId: string | null;
  step: number;
  data: DraftData;
  isSaving: boolean;

  setDraftId: (id: string) => void;
  setStep: (step: number) => void;
  patch: (updates: Partial<DraftData>) => void;
  reset: () => void;
  setSaving: (saving: boolean) => void;
}

export const useSubmissionStore = create<SubmissionStore>((set) => ({
  draftId: null,
  step: 1,
  data: { ...DRAFT_DATA_DEFAULTS },
  isSaving: false,

  setDraftId: (id) => set({ draftId: id }),
  setStep: (step) => set({ step }),
  patch: (updates) => set((s) => ({ data: { ...s.data, ...updates } })),
  reset: () =>
    set({ draftId: null, step: 1, data: { ...DRAFT_DATA_DEFAULTS }, isSaving: false }),
  setSaving: (isSaving) => set({ isSaving }),
}));
