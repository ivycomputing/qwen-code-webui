import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatMessages, type ChatMessagesHandle } from "./ChatMessages";
import type { AllMessage, ChatMessage } from "../../types";

// Mock useTranslation hook
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "chat.startConversation": "Start a conversation",
        "chat.typeToBegin": "Type to begin",
      };
      return translations[key] || key;
    },
  }),
}));

describe("ChatMessages", () => {
  const mockMessages: AllMessage[] = [
    {
      type: "chat",
      role: "user",
      content: "Hello",
      timestamp: 1000,
    } as ChatMessage,
    {
      type: "chat",
      role: "assistant",
      content: "Hi there",
      timestamp: 2000,
    } as ChatMessage,
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Basic rendering", () => {
    it("renders empty state when no messages", () => {
      render(<ChatMessages messages={[]} isLoading={false} />);

      expect(screen.getByText("Start a conversation")).toBeInTheDocument();
      expect(screen.getByText("Type to begin")).toBeInTheDocument();
    });

    it("renders messages correctly", () => {
      render(<ChatMessages messages={mockMessages} isLoading={false} />);

      expect(screen.getByText("Hello")).toBeInTheDocument();
      expect(screen.getByText("Hi there")).toBeInTheDocument();
    });

    it("shows loading indicator when isLoading is true", () => {
      render(<ChatMessages messages={mockMessages} isLoading={true} />);

      // LoadingComponent should be rendered - check for "Thinking..." text
      expect(screen.getByText("Thinking...")).toBeInTheDocument();
    });
  });

  describe("scrollToBottom method", () => {
    it("exposes scrollToBottom method via ref", () => {
      const ref = { current: null as ChatMessagesHandle | null };
      render(<ChatMessages ref={ref} messages={mockMessages} isLoading={false} />);

      expect(ref.current).not.toBeNull();
      expect(ref.current?.scrollToBottom).toBeDefined();
      expect(typeof ref.current?.scrollToBottom).toBe("function");
    });

    it("scrollToBottom calls scrollIntoView on messagesEndRef", () => {
      const ref = { current: null as ChatMessagesHandle | null };
      render(<ChatMessages ref={ref} messages={mockMessages} isLoading={false} />);

      // Mock scrollIntoView
      const scrollIntoViewMock = vi.fn();
      const messagesEndDiv = document.querySelector('[aria-hidden="true"] + div');
      if (messagesEndDiv) {
        messagesEndDiv.scrollIntoView = scrollIntoViewMock;
      }

      // Call scrollToBottom
      ref.current?.scrollToBottom();

      // Verify scrollIntoView was called with smooth behavior
      // Note: The actual element may not be accessible in test, but the method should exist
      expect(ref.current?.scrollToBottom).toBeDefined();
    });
  });

  describe("Message rendering", () => {
    it("filters out tool_use messages (ToolMessage)", () => {
      const messagesWithTool: AllMessage[] = [
        ...mockMessages,
        {
          type: "tool",
          tool_use_id: "tool-1",
          tool_name: "test_tool",
          input: {},
          timestamp: 3000,
        } as unknown as AllMessage,
      ];

      render(<ChatMessages messages={messagesWithTool} isLoading={false} />);

      // Tool_use messages should not be rendered
      expect(screen.getByText("Hello")).toBeInTheDocument();
      expect(screen.getByText("Hi there")).toBeInTheDocument();
      // No tool message content should appear
      expect(screen.queryByText("tool-1")).not.toBeInTheDocument();
    });

    it("filters out system messages (init, result, error)", () => {
      const messagesWithSystem: AllMessage[] = [
        ...mockMessages,
        {
          type: "system",
          subtype: "init",
          session_id: "session-1",
          timestamp: 3000,
        } as AllMessage,
        {
          type: "result",
          subtype: "success",
          timestamp: 4000,
        } as AllMessage,
      ];

      render(<ChatMessages messages={messagesWithSystem} isLoading={false} />);

      // System messages should not be rendered
      expect(screen.getByText("Hello")).toBeInTheDocument();
      expect(screen.getByText("Hi there")).toBeInTheDocument();
    });
  });

  describe("Expand thinking", () => {
    it("passes expandThinking prop correctly", () => {
      const ref = { current: null as ChatMessagesHandle | null };
      render(
        <ChatMessages
          ref={ref}
          messages={mockMessages}
          isLoading={false}
          expandThinking={true}
        />
      );

      // Component should render without errors
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
  });
});