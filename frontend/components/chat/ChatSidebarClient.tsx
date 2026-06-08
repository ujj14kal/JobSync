"use client";

/**
 * Client-only wrapper for ChatSidebar.
 * ssr:false must live inside a "use client" component — not a Server Component.
 * This wrapper is imported in the dashboard layout instead of ChatSidebar directly.
 */

import dynamic from "next/dynamic";

const ChatSidebar = dynamic(
  () => import("@/components/chat/ChatSidebar").then((m) => m.ChatSidebar),
  { ssr: false }
);

export default function ChatSidebarClient() {
  return <ChatSidebar />;
}
