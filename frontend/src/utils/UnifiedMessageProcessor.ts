import type {
  AllMessage,
  ChatMessage,
  ThinkingMessage,
  SDKMessage,
  TimestampedSDKMessage,
} from "../types";
import {
  convertSystemMessage,
  convertResultMessage,
  createToolMessage,
  createToolResultMessage,
  createThinkingMessage,
  createTodoMessageFromInput,
} from "./messageConversion";
import { isThinkingContentItem } from "./messageTypes";
import { extractToolInfo, generateToolPatterns } from "./toolUtils";
import type { CommandLoopRequest } from "../hooks/chat/usePermissions";

/**
 * Tool cache interface for tracking tool_use information
 */
interface ToolCache {
  name: string;
  input: Record<string, unknown>;
}

/**
 * Processing context interface for streaming use case
 */
export interface ProcessingContext {
  // Core message handling
  addMessage: (message: AllMessage) => void;
  updateLastMessage?: (updates: Partial<ChatMessage> | string) => void;

  // Current assistant message state (for streaming)
  currentAssistantMessage?: ChatMessage | null;
  setCurrentAssistantMessage?: (message: ChatMessage | null) => void;

  // Current thinking message state (for streaming consolidation)
  currentThinkingMessage?: ThinkingMessage | null;
  setCurrentThinkingMessage?: (message: ThinkingMessage | null) => void;
  updateThinkingMessage?: (content: string) => void;

  // Session handling
  onSessionId?: (sessionId: string) => void;
  hasReceivedInit?: boolean;
  setHasReceivedInit?: (received: boolean) => void;

  // Init message handling
  shouldShowInitMessage?: () => boolean;
  onInitMessageShown?: () => void;

  // Permission/Error handling
  onPermissionError?: (
    toolName: string,
    patterns: string[],
    toolUseId: string,
    requestId?: string,
  ) => void;
  onAbortRequest?: () => void;

  // Auto-rejection loop detection (SDK-level rejections, e.g. stdin closed)
  onAutoRejection?: (
    toolName: string,
    content: string,
  ) => CommandLoopRequest | null;

  // Command result loop detection
  onCommandResultLoop?: (
    toolName: string,
    input: Record<string, unknown>,
    result: { exitCode?: number; output: string }
  ) => CommandLoopRequest | null;
  onShowCommandLoopRequest?: (request: CommandLoopRequest) => void;

  // Thinking timeout
  onThinkingTimeout?: (
    accumulatedContent: string,
    info: { reason: "idle" | "absolute"; elapsedSeconds: number },
  ) => void;
}

/**
 * Processing options for different use cases
 */
export interface ProcessingOptions {
  /** Whether this is streaming mode (vs batch history processing) */
  isStreaming?: boolean;
  /** Override timestamp for batch processing */
  timestamp?: number;
}

/**
 * Helper function to detect tool use errors that should be displayed as regular results
 */
function isToolUseError(content: string): boolean {
  return content.includes("tool_use_error");
}

/**
 * Unified Message Processor
 *
 * This class provides consistent message processing logic for both
 * streaming and history loading scenarios, ensuring identical output
 * regardless of the data source.
 */
export class UnifiedMessageProcessor {
  private toolUseCache = new Map<string, ToolCache>();
  private processedToolResults = new Set<string>();
  private processedToolUses = new Set<string>();
  private processedThinkingFingerprints = new Set<string>();

  /**
   * Clear the tool use cache
   */
  public clearCache(): void {
    this.toolUseCache.clear();
    this.processedToolResults.clear();
    this.processedToolUses.clear();
    this.processedThinkingFingerprints.clear();
  }

  /**
   * Store tool_use information for later correlation with tool_result
   */
  private cacheToolUse(
    id: string,
    name: string,
    input: Record<string, unknown>,
  ): void {
    this.toolUseCache.set(id, { name, input });
  }

  /**
   * Retrieve cached tool_use information
   */
  private getCachedToolInfo(id: string): ToolCache | undefined {
    return this.toolUseCache.get(id);
  }

  /**
   * Handle permission errors during streaming
   */
  private handlePermissionError(
    contentItem: { tool_use_id?: string; content?: string | unknown[] },
    context: ProcessingContext,
  ): void {
    // Get cached tool_use information first (needed for both paths)
    const toolUseId = contentItem.tool_use_id || "";
    const cachedToolInfo = this.getCachedToolInfo(toolUseId);

    // Extract tool information for permission handling
    const { toolName, commands } = extractToolInfo(
      cachedToolInfo?.name,
      cachedToolInfo?.input,
    );

    // Check for auto-rejection loop before aborting
    if (context.onAutoRejection) {
      const content =
        typeof contentItem.content === "string"
          ? contentItem.content
          : JSON.stringify(contentItem.content);
      const loopRequest = context.onAutoRejection(toolName, content);
      if (loopRequest && context.onShowCommandLoopRequest) {
        // Loop detected - show loop dialog and abort
        if (context.onAbortRequest) {
          context.onAbortRequest();
        }
        context.onShowCommandLoopRequest(loopRequest);
        return;
      }
    }

    // No loop - normal permission error handling
    if (context.onAbortRequest) {
      context.onAbortRequest();
    }

    // Compute patterns based on tool type
    const patterns = generateToolPatterns(toolName, commands);

    // Notify parent component about permission error
    if (context.onPermissionError) {
      context.onPermissionError(toolName, patterns, toolUseId);
    }
  }

  /**
   * Process tool_result content item
   */
  private processToolResult(
    contentItem: {
      tool_use_id?: string;
      content?: string | unknown[];
      is_error?: boolean;
    },
    context: ProcessingContext,
    options: ProcessingOptions,
    toolUseResult?: unknown,
  ): void {
    // Get cached tool_use information to determine tool name
    const toolUseId = contentItem.tool_use_id || "";
    
    // Deduplication: check if this tool_result has already been processed
    if (this.processedToolResults.has(toolUseId)) {
      return;
    }
    
    // Mark this tool_result as processed
    this.processedToolResults.add(toolUseId);

    const content =
      typeof contentItem.content === "string"
        ? contentItem.content
        : JSON.stringify(contentItem.content);

    // Check for permission errors - but skip tool use errors and proactive denials
    if (
      options.isStreaming &&
      contentItem.is_error &&
      !isToolUseError(content) &&
      !content.includes("[proactive]")
    ) {
      this.handlePermissionError(contentItem, context);
      return;
    }

    const cachedToolInfo = this.getCachedToolInfo(toolUseId);
    const toolName = cachedToolInfo?.name || "Tool";
    const toolInput = cachedToolInfo?.input || {};

    // Check for command result loop detection (streaming only)
    if (options.isStreaming && context.onCommandResultLoop) {
      // Extract exit code and output from tool result
      const exitCode = this.extractExitCode(toolUseResult, content);
      const loopRequest = context.onCommandResultLoop(toolName, toolInput, {
        exitCode,
        output: content,
      });

      if (loopRequest && context.onShowCommandLoopRequest) {
        // Loop detected - show dialog and stop processing
        context.onShowCommandLoopRequest(loopRequest);
        return;
      }
    }

    // Don't show tool_result for TodoWrite since we already show TodoMessage from tool_use
    if (toolName === "TodoWrite") {
      return;
    }

    // This is a regular tool result - create a ToolResultMessage
    const toolResultMessage = createToolResultMessage(
      toolName,
      content,
      options.timestamp,
      toolUseResult,
    );
    context.addMessage(toolResultMessage);
  }

  /**
   * Extract exit code from tool result
   */
  private extractExitCode(
    toolUseResult: unknown,
    content: string
  ): number | undefined {
    // Try to extract from toolUseResult structure
    if (toolUseResult && typeof toolUseResult === "object") {
      const result = toolUseResult as Record<string, unknown>;
      if (result.exitCode !== undefined) {
        return result.exitCode as number;
      }
      if (result.exit_code !== undefined) {
        return result.exit_code as number;
      }
    }

    // Try to extract from content string (common patterns)
    const exitCodeMatch = content.match(/Exit Code:\s*(\d+)/i);
    if (exitCodeMatch) {
      return parseInt(exitCodeMatch[1], 10);
    }

    // Check for error indicators in content
    if (
      content.includes("Error:") ||
      content.includes("error:") ||
      content.includes("failed") ||
      content.includes("not found")
    ) {
      return 1; // Assume failure if error indicators present
    }

    return undefined;
  }

  /**
   * Handle assistant text content during streaming
   */
  private handleAssistantText(
    contentItem: { text?: string },
    context: ProcessingContext,
    options: ProcessingOptions,
  ): void {
    if (!options.isStreaming) {
      // For history processing, text will be handled at the message level
      return;
    }

    let messageToUpdate = context.currentAssistantMessage;

    if (!messageToUpdate) {
      messageToUpdate = {
        type: "chat",
        role: "assistant",
        content: "",
        timestamp: options.timestamp || Date.now(),
      };
      context.setCurrentAssistantMessage?.(messageToUpdate);
      context.addMessage(messageToUpdate);
    }

    const updatedContent =
      (messageToUpdate.content || "") + (contentItem.text || "");

    // Update the current assistant message state
    const updatedMessage = {
      ...messageToUpdate,
      content: updatedContent,
    };
    context.setCurrentAssistantMessage?.(updatedMessage);
    context.updateLastMessage?.(updatedContent);
  }

  /**
   * Handle tool_use content item
   */
  private handleToolUse(
    contentItem: {
      id?: string;
      name?: string;
      input?: unknown;
    },
    context: ProcessingContext,
    options: ProcessingOptions,
  ): void {
    const toolUseId = contentItem.id || "";
    
    // Deduplication: check if this tool_use has already been processed
    if (toolUseId && this.processedToolUses.has(toolUseId)) {
      return;
    }
    
    // Mark this tool_use as processed
    if (toolUseId) {
      this.processedToolUses.add(toolUseId);
    }

    // Cache tool_use information for later permission error handling and tool_result correlation
    if (contentItem.id && contentItem.name) {
      this.cacheToolUse(
        contentItem.id,
        contentItem.name,
        (contentItem.input as Record<string, unknown>) || {},
      );
    }

    // Special handling for ExitPlanMode - create plan message instead of tool message
    if (contentItem.name === "ExitPlanMode") {
      const inputObj = contentItem.input as { plan?: string } | undefined;
      const planContent = inputObj?.plan || "";
      const planMessage = {
        type: "plan" as const,
        plan: planContent,
        toolUseId: contentItem.id || "",
        timestamp: options.timestamp || Date.now(),
      };
      context.addMessage(planMessage);
    } else if (contentItem.name === "TodoWrite") {
      // Special handling for TodoWrite - create todo message from input
      const todoMessage = createTodoMessageFromInput(
        (contentItem.input as Record<string, unknown>) || {},
        options.timestamp,
      );
      if (todoMessage) {
        context.addMessage(todoMessage);
      } else {
        // Fallback to regular tool message if todo parsing fails
        const toolMessage = createToolMessage(contentItem, options.timestamp);
        context.addMessage(toolMessage);
      }
    } else {
      const toolMessage = createToolMessage(contentItem, options.timestamp);
      context.addMessage(toolMessage);
    }
  }

  /**
   * Process a system message
   */
  private processSystemMessage(
    message: Extract<SDKMessage | TimestampedSDKMessage, { type: "system" }>,
    context: ProcessingContext,
    options: ProcessingOptions,
  ): void {
    const timestamp = options.timestamp || Date.now();

    // Check if this is an init message and if we should show it (streaming only)
    if (options.isStreaming && message.subtype === "init") {
      // Mark that we've received init
      context.setHasReceivedInit?.(true);

      const shouldShow = context.shouldShowInitMessage?.() ?? true;
      if (shouldShow) {
        const systemMessage = convertSystemMessage(message, timestamp);
        context.addMessage(systemMessage);
        context.onInitMessageShown?.();
      }
    } else {
      // Always show non-init system messages
      const systemMessage = convertSystemMessage(message, timestamp);
      context.addMessage(systemMessage);
    }
  }

  /**
   * Process an assistant message
   */
  private processAssistantMessage(
    message: Extract<SDKMessage | TimestampedSDKMessage, { type: "assistant" }>,
    context: ProcessingContext,
    options: ProcessingOptions,
  ): AllMessage[] {
    const timestamp = options.timestamp || Date.now();
    const messages: AllMessage[] = [];

    // Update sessionId only for the first assistant message after init (streaming only)
    if (
      options.isStreaming &&
      context.hasReceivedInit &&
      message.session_id &&
      context.onSessionId
    ) {
      context.onSessionId(message.session_id);
    }

    // For batch processing, collect messages to return
    // For streaming, messages are added directly via context
    const localContext = options.isStreaming
      ? context
      : {
          ...context,
          addMessage: (msg: AllMessage) => messages.push(msg),
        };

    let assistantContent = "";
    const thinkingMessages: ThinkingMessage[] = [];

    // Qwen SDK uses 'parts' instead of 'content'
    const messageParts = (message.message as { parts?: unknown }).parts;

    // Check if message.parts exists (Qwen SDK format)
    if (Array.isArray(messageParts)) {
      for (const partItem of messageParts) {
        const part = partItem as {
          text?: string;
          thought?: boolean;
          type?: string;
          functionCall?: { id?: string; name?: string; args?: unknown };
        };
        if (part.thought && part.text) {
          // Thinking/reasoning content — consolidate with existing thinking
          const fingerprint = part.text.substring(0, 100);
          if (this.processedThinkingFingerprints.has(fingerprint)) {
            // Skip duplicate thinking content
          } else if (options.isStreaming) {
            this.processedThinkingFingerprints.add(fingerprint);
            const existing = context.currentThinkingMessage;
            if (existing) {
              // Append to existing thinking message
              const updatedContent = existing.content + "\n" + part.text;
              const updated = { ...existing, content: updatedContent };
              context.setCurrentThinkingMessage?.(updated);
              context.updateThinkingMessage?.(updatedContent);
            } else {
              const thinkingMessage = createThinkingMessage(part.text, timestamp);
              context.setCurrentThinkingMessage?.(thinkingMessage);
              context.addMessage(thinkingMessage);
            }
          } else {
            this.processedThinkingFingerprints.add(fingerprint);
            const thinkingMessage = createThinkingMessage(part.text, timestamp);
            thinkingMessages.push(thinkingMessage);
          }
        } else if (part.functionCall) {
          // Qwen SDK functionCall — equivalent to tool_use
          // Clear thinking state when tool call starts
          if (options.isStreaming) {
            context.setCurrentThinkingMessage?.(null);
          }
          this.handleToolUse(
            {
              id: part.functionCall.id,
              name: part.functionCall.name,
              input: part.functionCall.args,
            },
            localContext,
            options,
          );
        } else if (part.text) {
          // Regular text content — clear thinking state when text starts
          if (options.isStreaming) {
            context.setCurrentThinkingMessage?.(null);
          }
          if (options.isStreaming) {
            this.handleAssistantText({ text: part.text } as { type: "text"; text: string }, context, options);
          } else {
            assistantContent += part.text;
          }
        }
      }
    }
    // Check if message.content exists and is an array (Claude/other format)
    else if (message.message?.content && Array.isArray(message.message.content)) {
      for (const item of message.message.content) {
        if (item.type === "text") {
          // Regular text content — clear thinking state when text starts
          if (options.isStreaming) {
            context.setCurrentThinkingMessage?.(null);
          }
          if (options.isStreaming) {
            this.handleAssistantText(item, context, options);
          } else {
            assistantContent += (item as { text: string }).text;
          }
        } else if (item.type === "tool_use") {
          this.handleToolUse(item, localContext, options);
        } else if (isThinkingContentItem(item)) {
          const fingerprint = item.thinking.substring(0, 100);
          if (this.processedThinkingFingerprints.has(fingerprint)) {
            // Skip duplicate thinking content
          } else if (options.isStreaming) {
            this.processedThinkingFingerprints.add(fingerprint);
            const existing = context.currentThinkingMessage;
            if (existing) {
              const updatedContent = existing.content + "\n" + item.thinking;
              const updated = { ...existing, content: updatedContent };
              context.setCurrentThinkingMessage?.(updated);
              context.updateThinkingMessage?.(updatedContent);
            } else {
              const thinkingMessage = createThinkingMessage(
                item.thinking,
                timestamp,
              );
              context.setCurrentThinkingMessage?.(thinkingMessage);
              context.addMessage(thinkingMessage);
            }
          } else {
            this.processedThinkingFingerprints.add(fingerprint);
            const thinkingMessage = createThinkingMessage(
              item.thinking,
              timestamp,
            );
            thinkingMessages.push(thinkingMessage);
          }
        }
      }
    }

    // For batch processing, assemble the messages in proper order
    if (!options.isStreaming) {
      const orderedMessages: AllMessage[] = [];

      // Add thinking messages first (reasoning comes before action)
      orderedMessages.push(...thinkingMessages);

      // Add tool messages second (actions)
      orderedMessages.push(...messages);

      // Add assistant text message last if there is text content
      if (assistantContent.trim()) {
        const msgUsage = message.message?.usage;
        const assistantMessage: ChatMessage = {
          type: "chat",
          role: "assistant",
          content: assistantContent.trim(),
          timestamp,
          ...(msgUsage && {
            usage: {
              input_tokens: msgUsage.input_tokens ?? 0,
              output_tokens: msgUsage.output_tokens ?? 0,
              cache_read_input_tokens: msgUsage.cache_read_input_tokens,
            },
          }),
        };
        orderedMessages.push(assistantMessage);
      }

      return orderedMessages;
    }

    // Streaming: update usage on the last assistant message
    if (options.isStreaming && message.message?.usage && context.updateLastMessage) {
      const msgUsage = message.message.usage;
      context.updateLastMessage({
        usage: {
          input_tokens: msgUsage.input_tokens ?? 0,
          output_tokens: msgUsage.output_tokens ?? 0,
          cache_read_input_tokens: msgUsage.cache_read_input_tokens,
        },
      });
    }

    return messages;
  }

  /**
   * Process a result message
   */
  private processResultMessage(
    message: Extract<SDKMessage | TimestampedSDKMessage, { type: "result" }>,
    context: ProcessingContext,
    options: ProcessingOptions,
  ): void {
    const timestamp = options.timestamp || Date.now();
    const resultMessage = convertResultMessage(message, timestamp);
    context.addMessage(resultMessage);

    // Clear current assistant/thinking message (streaming only)
    if (options.isStreaming) {
      context.setCurrentAssistantMessage?.(null);
      context.setCurrentThinkingMessage?.(null);
    }
  }

  /**
   * Process a user message
   */
  private processUserMessage(
    message: Extract<SDKMessage | TimestampedSDKMessage, { type: "user" }>,
    context: ProcessingContext,
    options: ProcessingOptions,
  ): AllMessage[] {
    const timestamp = options.timestamp || Date.now();
    const messages: AllMessage[] = [];

    // For batch processing, collect messages to return
    // For streaming, messages are added directly via context
    const localContext = options.isStreaming
      ? context
      : {
          ...context,
          addMessage: (msg: AllMessage) => messages.push(msg),
        };

    const messageContent = message.message.content;
    // Qwen SDK uses 'parts' instead of 'content'
    const messageParts = (message.message as { parts?: unknown }).parts;

    if (Array.isArray(messageParts)) {
      // Qwen SDK format: message.parts array
      for (const partItem of messageParts) {
        const part = partItem as {
          type?: string;
          text?: string;
          functionResponse?: {
            id?: string;
            name?: string;
            response?: { output?: string; [key: string]: unknown };
          };
        };
        if (part.functionResponse) {
          // Qwen SDK functionResponse — equivalent to tool_result
          const fr = part.functionResponse;
          const toolUseId = fr.id || "";
          const content = fr.response?.output || JSON.stringify(fr.response || {});

          this.processToolResult(
            {
              tool_use_id: toolUseId,
              content,
              is_error: false,
            },
            localContext,
            options,
          );
        } else if (part.text) {
          // Text content in parts
          const userMessage: ChatMessage = {
            type: "chat",
            role: "user",
            content: part.text,
            timestamp,
          };
          localContext.addMessage(userMessage);
        }
      }
    } else if (Array.isArray(messageContent)) {
      for (const contentItem of messageContent) {
        if (contentItem.type === "tool_result") {
          // Extract toolUseResult from message if it exists
          const toolUseResult = (message as { toolUseResult?: unknown })
            .toolUseResult;
          this.processToolResult(
            contentItem,
            localContext,
            options,
            toolUseResult,
          );
        } else if (contentItem.type === "text") {
          // Regular text content
          const userMessage: ChatMessage = {
            type: "chat",
            role: "user",
            content: (contentItem as { text: string }).text,
            timestamp,
          };
          localContext.addMessage(userMessage);
        }
      }
    } else if (typeof messageContent === "string") {
      // Simple string content
      const userMessage: ChatMessage = {
        type: "chat",
        role: "user",
        content: messageContent,
        timestamp,
      };
      localContext.addMessage(userMessage);
    }

    return messages;
  }

  /**
   * Process a tool_result message (Qwen SDK format)
   * Qwen SDK sends tool results as top-level { type: "tool_result" } messages
   * with functionResponse in message.parts
   */
  private processToolResultMessage(
    message: Record<string, unknown>,
    context: ProcessingContext,
    options: ProcessingOptions,
  ): void {
    const msg = message as unknown as {
      message?: { parts?: unknown[] };
      toolCallResult?: { callId?: string; status?: string; resultDisplay?: string };
    };

    // Extract tool_use_id and content from functionResponse in parts
    const messageParts = msg.message?.parts;
    if (Array.isArray(messageParts)) {
      for (const partItem of messageParts) {
        const part = partItem as {
          functionResponse?: {
            id?: string;
            name?: string;
            response?: { output?: string; [key: string]: unknown };
          };
        };

        if (part.functionResponse) {
          const fr = part.functionResponse;
          const toolUseId = fr.id || "";
          const content = fr.response?.output || JSON.stringify(fr.response || {});

          // Check for is_error based on toolCallResult status
          // "error" = tool execution failed; "cancelled" + error response = Input closed / user abort
          const status = msg.toolCallResult?.status;
          const isError = status === "error" ||
            (status === "cancelled" && !!fr.response?.error);

          // Cache tool info from functionResponse if not already cached
          if (toolUseId && fr.name && !this.getCachedToolInfo(toolUseId)) {
            this.cacheToolUse(toolUseId, fr.name, {});
          }

          // Process as tool_result
          this.processToolResult(
            {
              tool_use_id: toolUseId,
              content,
              is_error: isError,
            },
            context,
            options,
            msg.toolCallResult,
          );
        }
      }
    }
  }

  /**
   * Process a single SDK message
   *
   * @param message - The SDK message to process
   * @param context - Processing context for callbacks and state management
   * @param options - Processing options (streaming vs batch, timestamp override)
   * @returns Array of messages for batch processing (empty for streaming)
   */
  public processMessage(
    message: SDKMessage | TimestampedSDKMessage,
    context: ProcessingContext,
    options: ProcessingOptions = {},
  ): AllMessage[] {
    const timestamp =
      options.timestamp ||
      ("timestamp" in message
        ? new Date(message.timestamp as string | number).getTime()
        : Date.now());

    const finalOptions = { ...options, timestamp };

    const messageType = (message as { type: string }).type;

    switch (messageType) {
      case "system":
        this.processSystemMessage(message as Extract<SDKMessage | TimestampedSDKMessage, { type: "system" }>, context, finalOptions);
        return [];

      case "assistant":
        return this.processAssistantMessage(message as Extract<SDKMessage | TimestampedSDKMessage, { type: "assistant" }>, context, finalOptions);

      case "result":
        this.processResultMessage(message as Extract<SDKMessage | TimestampedSDKMessage, { type: "result" }>, context, finalOptions);
        return [];

      case "user":
        return this.processUserMessage(message as Extract<SDKMessage | TimestampedSDKMessage, { type: "user" }>, context, finalOptions);

      case "tool_result":
        // Qwen SDK sends tool results as top-level messages
        this.processToolResultMessage(
          message as unknown as Record<string, unknown>,
          context,
          finalOptions,
        );
        return [];

      default:
        console.warn(
          "Unknown message type:",
          (message as { type: string }).type,
        );
        return [];
    }
  }

  /**
   * Process multiple messages in batch (for history loading)
   *
   * @param messages - Array of timestamped SDK messages
   * @param context - Processing context
   * @returns Array of processed messages
   */
  public processMessagesBatch(
    messages: TimestampedSDKMessage[],
    context?: Partial<ProcessingContext>,
  ): AllMessage[] {
    const allMessages: AllMessage[] = [];

    // Create a batch context that collects messages
    const batchContext: ProcessingContext = {
      addMessage: (msg: AllMessage) => allMessages.push(msg),
      ...context,
    };

    // Clear cache before processing batch
    this.clearCache();

    for (const message of messages) {
      const processedMessages = this.processMessage(message, batchContext, {
        isStreaming: false,
        timestamp: new Date(message.timestamp).getTime(),
      });
      allMessages.push(...processedMessages);
    }

    return allMessages;
  }
}
