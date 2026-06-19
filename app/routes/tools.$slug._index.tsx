import { useOutletContext } from "react-router";
import type { Route } from "./+types/tools.$slug._index";
import { ContentBlocks } from "@/components/tool/ContentBlocks";
import { buildToolMeta, type ToolPublicData } from "./tools.$slug";

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

export function meta({ matches }: Route.MetaArgs) {
  const parent = matches.find((m) => m?.id === "routes/tools.$slug");
  return buildToolMeta(parent?.data as ToolPublicData | null, "overview");
}

export default function ToolOverview() {
  const { blocks } = useOutletContext<OutletContext>();
  return <ContentBlocks blocks={blocks} section="overview" />;
}
