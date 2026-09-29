/**
 * JSONL file parsing utilities for conversation history
 * Handles reading and parsing Qwen conversation history files
 */

import type { SDKAssistantMessage, SDKUserMessage } from "@qwen-code/sdk";
import { basename, join } from "node:path";
import { logger } from "../utils/logger.ts";
import { readTextFile, readDir } from "../utils/fs.ts";

// CLI message format (role: "model" with parts array)
// This format is used by qwen-code-cli and differs from the WebUI format
interface CLIMessage {
  role: "model";
  parts: Array<{ text: string; thought?: boolean }>;
}

// Raw JSONL line structure from Qwen history files
// Supports both WebUI format (SDK types) and CLI format (CLIMessage)
export interface RawHistoryLine {
  type: "user" | "assistant" | "system" | "result";
  message?:
    | SDKUserMessage["message"]
    | SDKAssistantMessage["message"]
    | CLIMessage;
  sessionId: string;
  timestamp: string; // ISO string format
  uuid: string;
  parentUuid?: string | null;
  isSidechain?: boolean;
  userType?: string;
  cwd?: string;
  version?: string;
  requestId?: string;
}

// Legacy interface maintained for transition period
// TODO: Remove once all references are updated to use ConversationHistory
export interface ConversationFile {
  sessionId: string;
  filePath: string;
  messages: RawHistoryLine[];
  messageIds: Set<string>;
  startTime: string;
  lastTime: string;
  messageCount: number;
  lastMessagePreview: string;
}

/**
 * Parse a single JSONL file and extract conversation data
 * @private - Internal function used by parseAllHistoryFiles
 */
async function parseHistoryFile(
  filePath: string,
): Promise<ConversationFile | null> {
  try {
    const content = await readTextFile(filePath);
    const lines = content
      .trim()
      .split("\n")
      .filter((line) => line.trim());

    if (lines.length === 0) {
      return null; // Empty file
    }

    const messages: RawHistoryLine[] = [];
    const messageIds = new Set<string>();
    let startTime = "";
    let lastTime = "";
    let lastMessagePreview = "";

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as RawHistoryLine;
        messages.push(parsed);

        // Track message IDs from assistant messages
        if (parsed.message?.role === "assistant" && parsed.message?.id) {
          messageIds.add(parsed.message.id);
        }

        // Track timestamps
        if (!startTime || parsed.timestamp < startTime) {
          startTime = parsed.timestamp;
        }
        if (!lastTime || parsed.timestamp > lastTime) {
          lastTime = parsed.timestamp;
        }

        // Extract last message preview (from assistant or model messages)
        // Support both WebUI format (role=assistant, message.content) and
        // CLI format (role=model, message.parts)
        const msg = parsed.message;
        if (msg) {
          let contentArray: Array<{ text?: string; thought?: boolean }> | null =
            null;

          // WebUI format: role=assistant with content array
          if (msg.role === "assistant" && "content" in msg && msg.content) {
            contentArray = msg.content as Array<{ text?: string }>;
          }
          // CLI format: role=model with parts array
          else if (msg.role === "model" && "parts" in msg && msg.parts) {
            contentArray = msg.parts;
          }

          if (contentArray && Array.isArray(contentArray)) {
            for (const item of contentArray) {
              // Skip thought parts (internal reasoning, not user-visible)
              if (item && typeof item.text === "string" && !item.thought) {
                lastMessagePreview = item.text.substring(0, 100);
                break;
              }
            }
          }
        }
      } catch (parseError) {
        logger.history.error(`Failed to parse line in ${filePath}: {error}`, {
          error: parseError,
        });
        // Continue processing other lines
      }
    }

    // Extract session ID from file name (remove .jsonl extension).
    // basename() is required on Windows, where filePath uses backslashes.
    const fileName = basename(filePath);
    const sessionId = fileName.replace(".jsonl", "");

    return {
      sessionId,
      filePath,
      messages,
      messageIds,
      startTime,
      lastTime,
      messageCount: messages.length,
      lastMessagePreview: lastMessagePreview || "No preview available",
    };
  } catch (error) {
    logger.history.error(`Failed to read history file ${filePath}: {error}`, {
      error,
    });
    return null;
  }
}

/**
 * Get all JSONL files in a history directory
 * Scans both the root directory and the chats/ subdirectory
 * @private - Internal function used by parseAllHistoryFiles
 */
async function getHistoryFiles(historyDir: string): Promise<string[]> {
  try {
    const files: string[] = [];
    // A session id maps to exactly one file; if the same id somehow exists in
    // both the root directory and chats/, keep only the first (root) entry.
    const seenFileNames = new Set<string>();
    const pushFile = (dir: string, fileName: string) => {
      if (seenFileNames.has(fileName)) return;
      seenFileNames.add(fileName);
      files.push(join(dir, fileName));
    };

    // Scan root directory for JSONL files
    for await (const entry of readDir(historyDir)) {
      if (entry.isFile && entry.name.endsWith(".jsonl")) {
        pushFile(historyDir, entry.name);
      }
    }

    // Also scan chats/ subdirectory (qwen-code-cli stores sessions here)
    const chatsDir = join(historyDir, "chats");
    try {
      for await (const entry of readDir(chatsDir)) {
        if (entry.isFile && entry.name.endsWith(".jsonl")) {
          pushFile(chatsDir, entry.name);
        }
      }
    } catch {
      // chats/ subdirectory doesn't exist, ignore
    }

    return files;
  } catch {
    // Directory doesn't exist or can't be read
    return [];
  }
}

/**
 * Parse all conversation files in a history directory
 * Used by the histories endpoint to get conversation summaries
 */
export async function parseAllHistoryFiles(
  historyDir: string,
): Promise<ConversationFile[]> {
  const filePaths = await getHistoryFiles(historyDir);
  const results: ConversationFile[] = [];

  for (const filePath of filePaths) {
    const parsed = await parseHistoryFile(filePath);
    if (parsed) {
      results.push(parsed);
    }
  }

  return results;
}

/**
 * Check if one set of message IDs is a subset of another
 */
export function isSubset<T>(subset: Set<T>, superset: Set<T>): boolean {
  if (subset.size > superset.size) {
    return false;
  }

  for (const item of subset) {
    if (!superset.has(item)) {
      return false;
    }
  }

  return true;
}
