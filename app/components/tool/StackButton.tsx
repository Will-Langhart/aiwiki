import { useState } from "react";
import { Link } from "react-router";
import { Layers, Check } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { trackEvent } from "@/lib/analytics";
import {
  type StackEntry,
  type StackItemForm,
  removeStackItem,
  saveStackItem,
  stackItemSchema,
  toFormValues,
} from "@/lib/stack";
import { cn } from "@/lib/utils";

interface StackButtonProps {
  toolId: string;
  toolName: string;
  userId: string | undefined;
  /** The user's current stack row for this tool, if any. */
  entry: StackEntry | null;
  /** Listed starting price — prefills the cost for a new item. */
  listedPrice: number | null;
  /** Query key whose data includes `stackEntry` — invalidated after save/remove. */
  queryKey: unknown[];
  onAuthRequired: () => void;
}

const PERIODS = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
] as const;

const STATUSES = [
  { value: "active", label: "Paying" },
  { value: "trial", label: "On a trial" },
  { value: "cancelled", label: "Cancelled" },
] as const;

/**
 * "Add to my AI stack" (SPEC §19) — sits next to Bookmark in the tool header.
 * Client-only; the tool page itself stays prerendered.
 */
export function StackButton({
  toolId,
  toolName,
  userId,
  entry,
  listedPrice,
  queryKey,
  onAuthRequired,
}: StackButtonProps) {
  const [open, setOpen] = useState(false);
  const inStack = !!entry && entry.status !== "cancelled";

  const handleClick = () => {
    trackEvent("stack_add_click", { signed_in: !!userId, already_in_stack: !!entry });
    if (!userId) {
      onAuthRequired();
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClick}
        aria-label={entry ? `Edit ${toolName} in your AI stack` : `Add ${toolName} to your AI stack`}
        aria-pressed={inStack}
        title={entry ? "In your AI stack" : "Add to my AI stack"}
      >
        <Layers size={18} className={cn(inStack && "text-accent")} />
      </Button>
      {userId && open && (
        <StackDialog
          toolId={toolId}
          toolName={toolName}
          userId={userId}
          entry={entry}
          listedPrice={listedPrice}
          queryKey={queryKey}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}

/** The add/edit form. Also used directly by /account/stack's Edit buttons. */
export function StackDialog({
  toolId,
  toolName,
  userId,
  entry,
  listedPrice,
  queryKey,
  onOpenChange,
}: Omit<StackButtonProps, "onAuthRequired" | "userId"> & {
  userId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<StackItemForm>({
    resolver: zodResolver(stackItemSchema),
    defaultValues: toFormValues(entry, listedPrice),
  });
  const period = watch("billing_period");
  const status = watch("status");

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["my-stack"] }),
    ]);
  };

  const onSubmit = async (form: StackItemForm) => {
    setError(null);
    try {
      await saveStackItem(toolId, userId, form);
      trackEvent("stack_item_saved", { is_new: !entry, status: form.status, billing_period: form.billing_period });
      await refresh();
      setSaved(true);
    } catch {
      setError("Couldn't save. Please try again.");
    }
  };

  const onRemove = async () => {
    setError(null);
    try {
      await removeStackItem(toolId, userId);
      trackEvent("stack_item_removed", {});
      await refresh();
      onOpenChange(false);
    } catch {
      setError("Couldn't remove. Please try again.");
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {saved ? (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
              <Check size={20} className="text-accent" />
            </div>
            <DialogTitle>{toolName} is in your AI stack</DialogTitle>
            <DialogDescription className="mt-1.5">
              We'll email you if its pricing or plans change.
            </DialogDescription>
            <div className="flex gap-2 mt-6">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              <Link to="/account/stack" className={buttonVariants({ variant: "default" })}>
                See my stack →
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <DialogTitle>{entry ? `Edit ${toolName} in your AI stack` : `Add ${toolName} to your AI stack`}</DialogTitle>
              <DialogDescription className="mt-1">
                Track what you pay and get an email when its pricing changes. Only you can see this.
              </DialogDescription>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stack-cost" className="text-xs">You pay (USD)</Label>
                <Input id="stack-cost" inputMode="decimal" placeholder="20" {...register("cost")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stack-plan" className="text-xs">Plan</Label>
                <Input id="stack-plan" placeholder="Pro" {...register("plan_label")} />
              </div>
            </div>
            {errors.cost && <p className="text-xs text-danger -mt-2">{errors.cost.message}</p>}

            <Segmented
              label="Billed"
              options={PERIODS}
              value={period}
              onChange={(v) => setValue("billing_period", v, { shouldDirty: true })}
            />
            <Segmented
              label="Status"
              options={STATUSES}
              value={status}
              onChange={(v) => setValue("status", v, { shouldDirty: true })}
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stack-renews" className="text-xs">Renews on (optional)</Label>
                <Input id="stack-renews" type="date" {...register("renews_on")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stack-notes" className="text-xs">Note (optional)</Label>
              <Textarea id="stack-notes" rows={2} placeholder="What you use it for" {...register("notes")} />
              {errors.notes && <p className="text-xs text-danger">{errors.notes.message}</p>}
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}

            <div className="flex items-center justify-between gap-2 pt-1">
              {entry ? (
                <Button type="button" variant="ghost" onClick={onRemove} disabled={isSubmitting}>
                  Remove
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving…" : entry ? "Save" : "Add to stack"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium text-text mb-1.5">{label}</legend>
      <div className="inline-flex rounded-lg border border-border p-0.5 bg-surface">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
              value === o.value ? "bg-accent/10 text-accent font-medium" : "text-text-muted hover:text-text",
            )}
          >
            <input
              type="radio"
              name={label}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
