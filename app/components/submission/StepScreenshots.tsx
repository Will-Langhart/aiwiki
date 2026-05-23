import { useRef, useState } from "react";
import { Upload, X, ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase.client";
import { useSubmissionStore } from "@/stores/submission";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { User } from "@supabase/supabase-js";

interface Screenshot {
  storage_path: string;
  public_url: string;
  alt_text: string;
  caption: string;
}

interface StepScreenshotsProps {
  user: User;
  onNext: () => void;
  onBack: () => void;
}

export function StepScreenshots({ user, onNext, onBack }: StepScreenshotsProps) {
  const { data: storeData, patch } = useSubmissionStore();
  const [screenshots, setScreenshots] = useState<Screenshot[]>(storeData.screenshots);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList) => {
    const remaining = 5 - screenshots.length;
    if (remaining <= 0) return;
    setUploading(true);
    setUploadError(null);

    const toUpload = Array.from(files).slice(0, remaining);
    const results: Screenshot[] = [];

    for (const file of toUpload) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 5 * 1024 * 1024) {
        setUploadError("Each image must be under 5MB");
        continue;
      }

      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage
        .from("tool-screenshots")
        .upload(path, file, { upsert: false });

      if (error) {
        setUploadError(`Upload failed: ${error.message}`);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("tool-screenshots")
        .getPublicUrl(path);

      results.push({
        storage_path: path,
        public_url: urlData.publicUrl,
        alt_text: "",
        caption: "",
      });
    }

    const next = [...screenshots, ...results];
    setScreenshots(next);
    patch({ screenshots: next });
    setUploading(false);
  };

  const updateScreenshot = (i: number, updates: Partial<Screenshot>) => {
    const next = screenshots.map((s, idx) => (idx === i ? { ...s, ...updates } : s));
    setScreenshots(next);
    patch({ screenshots: next });
  };

  const removeScreenshot = (i: number) => {
    const next = screenshots.filter((_, idx) => idx !== i);
    setScreenshots(next);
    patch({ screenshots: next });
  };

  return (
    <div className="space-y-6">
      {/* Upload zone */}
      <div className="space-y-2">
        <Label>Screenshots (up to 5, optional)</Label>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: file input triggers on click */}
        <div
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed border-border hover:border-accent/50 hover:bg-accent/5 cursor-pointer transition-colors"
        >
          {uploading ? (
            <Loader2 size={24} className="text-accent animate-spin" />
          ) : (
            <Upload size={24} className="text-text-subtle" />
          )}
          <div className="text-center">
            <p className="text-sm font-medium text-text">
              {uploading ? "Uploading…" : "Click to upload images"}
            </p>
            <p className="text-xs text-text-muted mt-0.5">PNG, JPG, WebP · max 5MB each · up to 5 images</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={screenshots.length >= 5 || uploading}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </div>
        {uploadError && <p className="text-xs text-danger">{uploadError}</p>}
      </div>

      {/* Screenshot list */}
      {screenshots.length > 0 && (
        <div className="space-y-4">
          {screenshots.map((s, i) => (
            <div key={s.storage_path} className="flex gap-3 p-3 rounded-lg border border-border bg-surface-2">
              {s.public_url ? (
                <img
                  src={s.public_url}
                  alt={s.alt_text || "Screenshot"}
                  className="w-20 h-14 rounded object-cover flex-shrink-0 bg-surface"
                />
              ) : (
                <div className="w-20 h-14 rounded flex items-center justify-center bg-surface flex-shrink-0">
                  <ImageIcon size={20} className="text-text-subtle" />
                </div>
              )}
              <div className="flex-1 space-y-1.5 min-w-0">
                <Input
                  placeholder="Alt text (required for accessibility)"
                  value={s.alt_text}
                  onChange={(e) => updateScreenshot(i, { alt_text: e.target.value })}
                  className="text-xs h-7"
                />
                <Input
                  placeholder="Caption (optional)"
                  value={s.caption}
                  onChange={(e) => updateScreenshot(i, { caption: e.target.value })}
                  className="text-xs h-7"
                />
              </div>
              <button
                type="button"
                onClick={() => removeScreenshot(i)}
                className="text-text-muted hover:text-danger flex-shrink-0 self-start mt-1"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={onNext}>Continue →</Button>
      </div>
    </div>
  );
}
