import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { Search, ArrowRight, Tag } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/lib/supabase.client";
import { useDebounce } from "@/hooks/useDebounce";

interface SearchResult {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  logo_url: string | null;
  pricing_tier: string;
  audience_fit: string;
}

interface SearchCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchCommandPalette({ open, onOpenChange }: SearchCommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 200);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const { data } = await supabase.rpc("search_tools", {
        query: q || undefined,
        page_size: 8,
        page_offset: 0,
      });
      setResults((data as SearchResult[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      search(debouncedQuery);
    }
  }, [open, debouncedQuery, search]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  const goTo = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search AI tools…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {loading ? (
          <div className="py-6 text-center text-sm text-text-muted">Searching…</div>
        ) : (
          <>
            <CommandEmpty>No tools found for "{query}"</CommandEmpty>

            {results.length > 0 && (
              <CommandGroup heading="Tools">
                {results.map((tool) => (
                  <CommandItem
                    key={tool.id}
                    value={tool.slug}
                    onSelect={() => goTo(`/tools/${tool.slug}`)}
                    className="cursor-pointer"
                  >
                    {tool.logo_url ? (
                      <img
                        src={tool.logo_url}
                        alt={tool.name}
                        className="w-5 h-5 rounded object-contain bg-surface-2"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded bg-accent/10 flex items-center justify-center text-accent text-xs font-bold">
                        {tool.name[0]}
                      </div>
                    )}
                    <span className="font-medium">{tool.name}</span>
                    <span className="text-text-muted text-xs truncate">{tool.tagline}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandSeparator />

            <CommandGroup heading="Navigation">
              <CommandItem onSelect={() => goTo("/tools")} className="cursor-pointer">
                <Tag size={14} />
                Browse all tools
              </CommandItem>
              {query && (
                <CommandItem
                  onSelect={() => goTo(`/search?q=${encodeURIComponent(query)}`)}
                  className="cursor-pointer"
                >
                  <Search size={14} />
                  Search for "{query}"
                  <ArrowRight size={12} className="ml-auto text-text-subtle" />
                </CommandItem>
              )}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
