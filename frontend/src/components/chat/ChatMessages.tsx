import { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { AllMessage } from "../../types";
import {
  isChatMessage,
  isSystemMessage,
  isToolResultMessage,
  isPlanMessage,
  isThinkingMessage,
  isTodoMessage,
  isAskUserQuestionMessage,
} from "../../types";
import {
  ChatMessageComponent,
  ToolResultMessageComponent,
  PlanMessageComponent,
  ThinkingMessageComponent,
  TodoMessageComponent,
  AskUserQuestionMessageComponent,
  LoadingComponent,
} from "../MessageComponents";
import { UI_CONSTANTS } from "../../utils/constants";

interface ChatMessagesProps {
  messages: AllMessage[];
  isLoading: boolean;
  expandThinking?: boolean;
}

export function ChatMessages({ messages, isLoading, expandThinking }: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    if (messagesEndRef.current && messagesEndRef.current.scrollIntoView) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Track whether user has scrolled away from bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    let awayTimer: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const nearBottom = scrollHeight - scrollTop - clientHeight < UI_CONSTANTS.NEAR_BOTTOM_THRESHOLD_PX;

      if (nearBottom) {
        clearTimeout(awayTimer);
        shouldAutoScroll.current = true;
      } else {
        clearTimeout(awayTimer);
        awayTimer = setTimeout(() => {
          shouldAutoScroll.current = false;
        }, 100);
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      clearTimeout(awayTimer);
    };
  }, []);

  // Auto-scroll when messages change (only if user hasn't scrolled away)
  useEffect(() => {
    if (shouldAutoScroll.current) {
      scrollToBottom();
    }
  }, [messages]);

  const renderMessage = (message: AllMessage, index: number) => {
    // Use timestamp as key for stable rendering, fallback to index if needed
    const key = `${message.timestamp}-${index}`;

    // Skip rendering ToolMessage (tool_use) - only render ToolResultMessage (tool_result)
    // ToolResultMessage already contains all the necessary information about the command execution
    if (message.type === "tool") {
      return null;
    }

    // Skip system messages (init, result, error) - not useful for users
    if (isSystemMessage(message)) {
      return null;
    }

    if (isToolResultMessage(message)) {
      return <ToolResultMessageComponent key={key} message={message} forceExpanded={expandThinking} />;
    } else if (isPlanMessage(message)) {
      return <PlanMessageComponent key={key} message={message} />;
    } else if (isThinkingMessage(message)) {
      return <ThinkingMessageComponent key={key} message={message} forceExpanded={expandThinking} />;
    } else if (isTodoMessage(message)) {
      return <TodoMessageComponent key={key} message={message} />;
    } else if (isAskUserQuestionMessage(message)) {
      return <AskUserQuestionMessageComponent key={key} message={message} />;
    } else if (isChatMessage(message)) {
      return <ChatMessageComponent key={key} message={message} />;
    }
    return null;
  };

  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 overflow-y-auto bg-white/70 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60 p-3 sm:p-6 mb-3 sm:mb-6 rounded-2xl shadow-sm backdrop-blur-sm flex flex-col"
    >
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Spacer div to push messages to the bottom */}
          <div className="flex-1" aria-hidden="true"></div>
          {messages.map(renderMessage)}
          {isLoading && <LoadingComponent />}
          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  );
}

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
