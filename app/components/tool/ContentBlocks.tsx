import { useAudienceStore } from "@/stores/audience";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface ContentBlock {
  id: string;
  section: string;
  audience: "technical" | "non_technical" | "both";
  heading: string | null;
  body_md: string;
  sort_order: number;
}

interface ContentBlocksProps {
  blocks: ContentBlock[];
  section: "overview" | "docs" | "use_cases";
}

export function ContentBlocks({ blocks, section }: ContentBlocksProps) {
  const { audience } = useAudienceStore();

  const filtered = blocks
    .filter((b) => b.section === section)
    .filter((b) => {
      if (audience === "both") return b.audience === "both" || b.audience === "technical";
      if (audience === "technical") return b.audience === "technical" || b.audience === "both";
      if (audience === "non_technical") return b.audience === "non_technical" || b.audience === "both";
      return true;
    })
    .sort((a, b) => a.sort_order - b.sort_order);

  if (filtered.length === 0) {
    return (
      <p className="text-text-muted text-sm py-8 text-center">
        No content available for this audience yet.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {filtered.map((block) => (
        <div key={block.id}>
          {block.heading && (
            <h2 className="text-xl font-semibold text-text mb-3">{block.heading}</h2>
          )}
          <MarkdownRenderer content={block.body_md} />
        </div>
      ))}
    </div>
  );
}
