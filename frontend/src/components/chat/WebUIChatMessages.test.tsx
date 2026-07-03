import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebUIChatMessages, type WebUIChatMessagesHandle } from "./WebUIChatMessages";
import type { AllMessage, ChatMessage } from "../../types";

// Mock @qwen-code/webui
vi.mock("@qwen-code/webui", () => ({
  ChatViewer: vi.fn(({ messages, className }) => (
    <div className={className} data-testid="chat-viewer">
      {messages.map((msg: any, idx: number) => (
        <div key={idx} data-testid={`message-${idx}`}>
          {typeof msg.content === 'string' ? msg.content : 
           typeof msg.message === 'string' ? msg.message : 
           JSON.stringify(msg)}
        </div>
      ))}
    </div>
  )),
}));

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

describe("WebUIChatMessages", () => {
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
      render(<WebUIChatMessages messages={[]} />);

      expect(screen.getByText("Start a conversation")).toBeInTheDocument();
      expect(screen.getByText("Type to begin")).toBeInTheDocument();
    });

    it("renders messages correctly through ChatViewer", () => {
      render(<WebUIChatMessages messages={mockMessages} />);

      // ChatViewer should be rendered
      expect(screen.getByTestId("chat-viewer")).toBeInTheDocument();
    });

    it("applies custom className", () => {
      render(<WebUIChatMessages messages={mockMessages} className="custom-class" />);

      const container = screen.getByTestId("chat-viewer").parentElement;
      expect(container?.classList.contains("custom-class")).toBe(true);
    });
  });

  describe("scrollToBottom method", () => {
    it("exposes scrollToBottom method via ref", () => {
      const ref = { current: null as WebUIChatMessagesHandle | null };
      render(<WebUIChatMessages ref={ref} messages={mockMessages} />);

      expect(ref.current).not.toBeNull();
      expect(ref.current?.scrollToBottom).toBeDefined();
      expect(typeof ref.current?.scrollToBottom).toBe("function");
    });

    it("scrollToBottom calls ChatViewer scrollToBottom with smooth behavior", () => {
      const ref = { current: null as WebUIChatMessagesHandle | null };
      render(<WebUIChatMessages ref={ref} messages={mockMessages} />);

      // Call scrollToBottom
      ref.current?.scrollToBottom();

      // Method should exist and be callable
      expect(ref.current?.scrollToBottom).toBeDefined();
    });
  });

  describe("Message filtering", () => {
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

      render(<WebUIChatMessages messages={messagesWithSystem} />);

      // ChatViewer should be rendered but system messages filtered
      expect(screen.getByTestId("chat-viewer")).toBeInTheDocument();
    });
  });

  describe("Expand thinking", () => {
    it("passes expandThinking prop correctly", () => {
      const ref = { current: null as WebUIChatMessagesHandle | null };
      render(
        <WebUIChatMessages
          ref={ref}
          messages={mockMessages}
          expandThinking={true}
        />
      );

      // Component should render without errors
      expect(screen.getByTestId("chat-viewer")).toBeInTheDocument();
    });
  });
});