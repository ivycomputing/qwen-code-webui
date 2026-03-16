/**
 * WebUI Chat Messages Component
 *
 * A wrapper around @qwen-code/webui ChatViewer component with support
 * for extended message types (plan, system, etc.)
 *
 * Note: Todo messages are handled by ChatViewer using UpdatedPlanToolCall
 */

import { useRef, useEffect, useMemo } from "react";
import {
  ChatViewer,
  type ChatViewerHandle,
  type ChatMessageData,
} from "@qwen-code/webui";
import "@qwen-code/webui/styles.css";
import type { AllMessage } from "../../types";
import {
  adaptMessagesToWebUI,
  filterEmptyMessages,
  isPlanMessage,
  type ExtendedMessage,
} from "../../adapters";
import { PlanMessageComponent } from "../MessageComponents";
import { ThinkingMessageComponent } from "../MessageComponents";
import { SystemMessageComponent } from "../MessageComponents";

interface WebUIChatMessagesProps {
  messages: AllMessage[];
  isLoading: boolean;
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
  isLoading,
  className,
}: WebUIChatMessagesProps) {
  const chatViewerRef = useRef<ChatViewerHandle>(null);

  // Adapt messages to webui format
  const adaptedMessages = useMemo(() => {
    const adapted = adaptMessagesToWebUI(messages);
    return filterEmptyMessages(adapted);
  }, [messages]);

  // Separate extended messages that need custom rendering
  // Note: Todo messages are handled by ChatViewer using UpdatedPlanToolCall
  const { standardMessages, extendedMessages } = useMemo(() => {
    const standard: ChatMessageData[] = [];
    const extended: Array<{ message: ExtendedMessage; index: number }> = [];

    adaptedMessages.forEach((msg, index) => {
      // Check if this message needs custom rendering
      // Todo messages are now handled by ChatViewer using UpdatedPlanToolCall
      if (
        isPlanMessage(msg) ||
        msg.extendedType === "system" ||
        msg.extendedType === "result" ||
        msg.extendedType === "error"
      ) {
        extended.push({ message: msg, index });
      } else {
        standard.push(msg);
      }
    });

    return { standardMessages: standard, extendedMessages: extended };
  }, [adaptedMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (chatViewerRef.current) {
      chatViewerRef.current.scrollToBottom("smooth");
    }
  }, [messages]);

  // Render extended messages (plan, system, etc.)
  // Note: Todo messages are handled by ChatViewer using UpdatedPlanToolCall
  const renderExtendedMessage = (
    item: { message: ExtendedMessage; index: number },
  ) => {
    const { message: msg, index } = item;
    const key = `${msg.uuid}-${index}`;

    switch (msg.extendedType) {
      case "plan":
        return (
          <PlanMessageComponent
            key={key}
            message={{
              type: "plan",
              plan: msg.data?.plan || "",
              toolUseId: "",
              timestamp: new Date(msg.timestamp).getTime(),
            }}
          />
        );

      case "thinking":
        return (
          <ThinkingMessageComponent
            key={key}
            message={{
              type: "thinking",
              content:
                typeof msg.message?.content === "string"
                  ? msg.message.content
                  : "",
              timestamp: new Date(msg.timestamp).getTime(),
            }}
          />
        );

      case "system":
      case "result":
      case "error":
        return (
          <SystemMessageComponent
            key={key}
            message={
              msg.original as Parameters<
                typeof SystemMessageComponent
              >[0]["message"]
            }
          />
        );

      default:
        return null;
    }
  };

  // If we have extended messages, use hybrid rendering
  if (extendedMessages.length > 0) {
    return (
      <div
        className={`flex-1 overflow-y-auto bg-white/70 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60 p-3 sm:p-6 mb-3 sm:mb-6 rounded-2xl shadow-sm backdrop-blur-sm flex flex-col ${className || ""}`}
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="flex-1" aria-hidden="true" />

            {/* Render standard messages with ChatViewer */}
            {standardMessages.length > 0 && (
              <ChatViewer
                ref={chatViewerRef}
                messages={standardMessages}
                className="webui-chat-viewer"
                emptyMessage=""
                autoScroll={true}
              />
            )}

            {/* Render extended messages with custom components */}
            {extendedMessages.map(renderExtendedMessage)}

            {/* Loading indicator */}
            {isLoading && <LoadingComponent />}
          </>
        )}
      </div>
    );
  }

  // Use pure ChatViewer for standard messages
  return (
    <div
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
          {isLoading && <LoadingComponent />}
        </>
      )}
    </div>
  );
}

/**
 * Empty state component
 */
function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center text-center text-slate-500 dark:text-slate-400">
      <div>
        <div className="text-6xl mb-6 opacity-60">
          <span role="img" aria-label="chat icon">
            💬
          </span>
        </div>
        <p className="text-lg font-medium">Start a conversation with Qwen</p>
        <p className="text-sm mt-2 opacity-80">
          Type your message below to begin
        </p>
      </div>
    </div>
  );
}

/**
 * Loading component
 */
function LoadingComponent() {
  return (
    <div className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-lg p-4 mt-2">
      <div className="text-xs font-semibold mb-2 opacity-90 text-slate-600 dark:text-slate-400">
        Qwen
      </div>
      <div className="flex items-center gap-2 text-sm">
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        <span className="animate-pulse">Thinking...</span>
      </div>
    </div>
  );
}

export default WebUIChatMessages;