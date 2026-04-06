/**
 * WebUI Chat Messages Component
 *
 * A wrapper around @qwen-code/webui ChatViewer component with support
 * for extended message types (plan, system, etc.)
 *
 * Note: Todo messages are handled by ChatViewer using UpdatedPlanToolCall
 */

import { useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ChatViewer,
  type ChatViewerHandle,
} from "@qwen-code/webui";
import "@qwen-code/webui/styles.css";
import type { AllMessage } from "../../types";
import type { ExtendedMessage } from "../../adapters";
import {
  adaptMessagesToWebUI,
  filterEmptyMessages,
} from "../../adapters";

interface WebUIChatMessagesProps {
  messages: AllMessage[];
  expandThinking?: boolean;
  className?: string;
}

/**
 * WebUI-based chat messages display component
 *
 * Uses @qwen-code/webui ChatViewer for standard message types,
 * with custom rendering for extended types (plan, system, etc.)
 */
export function WebUIChatMessages({
  messages,
  expandThinking,
  className,
}: WebUIChatMessagesProps) {
  const chatViewerRef = useRef<ChatViewerHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Adapt messages to webui format
  const adaptedMessages = useMemo(() => {
    const adapted = adaptMessagesToWebUI(messages);
    return filterEmptyMessages(adapted);
  }, [messages]);

  // Filter out system messages (init, result, error) - not useful for users
  const standardMessages = useMemo(() => {
    return adaptedMessages.filter(msg => {
      const extType = (msg as ExtendedMessage).extendedType;
      return extType !== "system" && extType !== "result" && extType !== "error";
    });
  }, [adaptedMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (chatViewerRef.current) {
      chatViewerRef.current.scrollToBottom("smooth");
    }
  }, [messages]);

  // Force expand/collapse thinking messages based on expandThinking prop
  useEffect(() => {
    if (!containerRef.current) return;

    // Find all thinking toggle buttons
    const toggleButtons = containerRef.current.querySelectorAll<HTMLButtonElement>(
      '.thinking-toggle-btn'
    );
    
    toggleButtons.forEach((btn) => {
      const isExpanded = btn.getAttribute('aria-expanded') === 'true';
      
      // Click if current state doesn't match desired state
      if (expandThinking && !isExpanded) {
        btn.click();
      } else if (!expandThinking && isExpanded) {
        btn.click();
      }
    });
  }, [expandThinking, messages]);

  // Use pure ChatViewer for all messages
  // Thinking messages are rendered by ChatViewer with native collapse/expand support
  return (
    <div
      ref={containerRef}
      className={`flex-1 overflow-y-auto bg-white/70 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60 p-3 sm:p-6 mb-3 sm:mb-6 rounded-2xl shadow-sm backdrop-blur-sm flex flex-col ${className || ""}`}
    >
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="flex-1" aria-hidden="true" />
          <ChatViewer
            ref={chatViewerRef}
            messages={standardMessages}
            className="webui-chat-viewer"
            emptyMessage=""
            autoScroll={true}
          />
        </>
      )}
    </div>
  );
}

/**
 * Empty state component
 */
function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex items-center justify-center text-center text-slate-500 dark:text-slate-400">
      <div>
        <div className="text-6xl mb-6 opacity-60">
          <span role="img" aria-label="chat icon">
            💬
          </span>
        </div>
        <p className="text-lg font-medium">{t("chat.startConversation")}</p>
        <p className="text-sm mt-2 opacity-80">
          {t("chat.typeToBegin")}
        </p>
      </div>
    </div>
  );
}

export default WebUIChatMessages;