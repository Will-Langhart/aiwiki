import { useOutletContext } from "react-router";
import { ContentBlocks } from "@/components/tool/ContentBlocks";

interface OutletContext {
  blocks: Array<{
    id: string;
    tool_id: string;
    section: string;
    audience: "technical" | "non_technical" | "both";
    heading: string | null;
    body_md: string;
    sort_order: number;
  }>;
}

export function meta() {
  return [{ title: "Docs" }];
}

export default function ToolDocs() {
  const { blocks } = useOutletContext<OutletContext>();
  return <ContentBlocks blocks={blocks} section="docs" />;
}
