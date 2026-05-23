import { useNavigate } from "react-router";
import { GitCompare, X, Trash2 } from "lucide-react";
import { useCompareStore } from "@/stores/compare";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function CompareTray() {
  const { items, remove, clear, isOpen, setOpen } = useCompareStore();
  const navigate = useNavigate();

  if (items.length === 0) return null;

  const handleCompare = () => {
    const slugs = items.map((i) => i.slug).join(",");
    navigate(`/compare?tools=${slugs}`);
    setOpen(false);
    // Don't clear so the selection persists on the compare page
  };

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      {/* Floating trigger button */}
      <div className="fixed bottom-6 right-6 z-50">
        <SheetTrigger
          render={
            <button
              type="button"
              className="flex items-center gap-2 bg-accent text-accent-fg px-4 py-2.5 rounded-full shadow-xl hover:opacity-90 active:scale-95 transition-all font-medium text-sm"
            />
          }
        >
          <GitCompare size={16} />
          Compare
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent-fg/20 text-xs font-bold">
            {items.length}
          </span>
        </SheetTrigger>
      </div>

      <SheetContent side="right" className="w-80 p-0">
        <SheetHeader className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base">Compare tools</SheetTitle>
            <button
              type="button"
              onClick={clear}
              className="text-text-muted hover:text-danger transition-colors p-1 rounded"
              aria-label="Clear all"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </SheetHeader>

        {/* Tool list */}
        <div className="flex flex-col gap-2 p-4 flex-1 overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-surface-2"
            >
              {item.logo_url ? (
                <img
                  src={item.logo_url}
                  alt={item.name}
                  className="w-8 h-8 rounded-md object-contain bg-surface flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-md bg-accent/10 flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">
                  {item.name[0]}
                </div>
              )}
              <span className="flex-1 text-sm font-medium text-text truncate">
                {item.name}
              </span>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="text-text-muted hover:text-text transition-colors p-1 rounded flex-shrink-0"
                aria-label={`Remove ${item.name}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}

          {/* "Add more" hint */}
          {items.length < 2 && (
            <p className="text-xs text-text-muted text-center py-2">
              Add {2 - items.length} more tool{items.length === 0 ? "s" : ""} to compare
            </p>
          )}

          {items.length < 4 && items.length >= 1 && (
            <p className="text-xs text-text-subtle text-center">
              Up to 4 tools supported
            </p>
          )}
        </div>

        {/* CTA */}
        <div className="p-4 border-t border-border">
          <Button
            className="w-full"
            disabled={items.length < 2}
            onClick={handleCompare}
          >
            <GitCompare size={15} className="mr-2" />
            Compare {items.length} tool{items.length !== 1 ? "s" : ""}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
