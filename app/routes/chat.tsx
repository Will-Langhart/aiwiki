import type { Route } from "./+types/chat";
import { ChatInterface } from "@/components/chat/ChatInterface";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Ask AI Wiki — AI tool recommendations" },
    { name: "description", content: "Get personalised AI tool recommendations from our RAG-powered assistant." },
  ];
}

export default function ChatPage() {
  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <ChatInterface />
    </div>
  );
}
