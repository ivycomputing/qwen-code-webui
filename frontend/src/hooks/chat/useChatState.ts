import { useState, useCallback, useEffect, useMemo } from "react";
import type { AllMessage, ChatMessage, ThinkingMessage } from "../../types";
import { generateId } from "../../utils/id";

interface ChatStateOptions {
  initialMessages?: AllMessage[];
  initialSessionId?: string;
}

const DEFAULT_MESSAGES: AllMessage[] = [];

export function useChatState(options: ChatStateOptions = {}) {
  const { initialMessages = DEFAULT_MESSAGES, initialSessionId = null } =
    options;

  // Memoize initial messages to prevent infinite loops
  const memoizedInitialMessages = useMemo(
    () => initialMessages,
    [initialMessages],
  );

  const [messages, setMessages] = useState<AllMessage[]>(
    memoizedInitialMessages,
  );
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    initialSessionId,
  );
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [hasShownInitMessage, setHasShownInitMessage] = useState(false);
  const [hasReceivedInit, setHasReceivedInit] = useState(false);
  const [currentAssistantMessage, setCurrentAssistantMessage] =
    useState<ChatMessage | null>(null);
  const [currentThinkingMessage, setCurrentThinkingMessage] =
    useState<ThinkingMessage | null>(null);

  // Update messages and sessionId when initial values change
  useEffect(() => {
    setMessages(memoizedInitialMessages);
  }, [memoizedInitialMessages]);

  useEffect(() => {
    setCurrentSessionId(initialSessionId);
  }, [initialSessionId]);

  const addMessage = useCallback((msg: AllMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastMessage = useCallback((updates: Partial<ChatMessage> | string) => {
    setMessages((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        const msg = prev[i];
        if (msg.type === "chat" && (msg as ChatMessage).role === "assistant") {
          const merged = typeof updates === "string"
            ? { ...msg, content: updates }
            : { ...msg, ...updates };
          return [...prev.slice(0, i), merged as ChatMessage, ...prev.slice(i + 1)];
        }
      }
      return prev;
    });
  }, []);

  const updateThinkingMessage = useCallback((content: string) => {
    setMessages((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].type === "thinking") {
          return prev.map((msg, index) =>
            index === i ? { ...msg, content } : msg
          );
        }
      }
      return prev;
    });
  }, []);

  const clearInput = useCallback(() => {
    setInput("");
  }, []);

  const generateRequestId = useCallback(() => {
    const requestId = generateId();
    setCurrentRequestId(requestId);
    return requestId;
  }, []);

  const resetRequestState = useCallback(() => {
    setIsLoading(false);
    setCurrentRequestId(null);
    setCurrentAssistantMessage(null);
    setCurrentThinkingMessage(null);
  }, []);

  const startRequest = useCallback(() => {
    setIsLoading(true);
    setCurrentAssistantMessage(null);
    setCurrentThinkingMessage(null);
    setHasReceivedInit(false);
  }, []);

  return {
    // State
    messages,
    input,
    isLoading,
    currentSessionId,
    currentRequestId,
    hasShownInitMessage,
    hasReceivedInit,
    currentAssistantMessage,
    currentThinkingMessage,

    // State setters
    setMessages,
    setInput,
    setIsLoading,
    setCurrentSessionId,
    setCurrentRequestId,
    setHasShownInitMessage,
    setHasReceivedInit,
    setCurrentAssistantMessage,
    setCurrentThinkingMessage,

    // Helper functions
    addMessage,
    updateLastMessage,
    updateThinkingMessage,
    clearInput,
    generateRequestId,
    resetRequestState,
    startRequest,
  };
}
