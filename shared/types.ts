export interface StreamResponse {
  type: "claude_json" | "error" | "done" | "aborted" | "permission_request" | "heartbeat" | "control_request";
  data?: unknown; // SDKMessage object for claude_json type (Qwen SDK message)
  error?: string;
  // Fields for permission_request type
  permissionId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  suggestions?: Array<{ type: string; label: string; description?: string }>;
  // Deadline: unanswered prompts must be denied, never approved.
  // Used to avoid the CLI's 30-second control-request timeout in approval-mode default.
  permissionTimeoutMs?: number;
  // For ask_user_question tool: confirmation type and questions
  confirmationType?: "default" | "ask_user_question";
  questions?: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description?: string }>;
    multiSelect: boolean;
  }>;
  // Fields for control_request type (local mode permission requests)
  request_id?: string;
  request?: {
    subtype: string;
    tool_name: string;
    tool_use_id?: string;
    input?: Record<string, unknown>;
    permission_suggestions?: Array<{ rule: string; description: string }>;
    auto_approve_ms?: number;
    confirmation_type?: string;
    questions?: Array<{
      question: string;
      header: string;
      options: Array<{ label: string; description?: string }>;
      multiSelect: boolean;
    }>;
  };
}

export interface ChatRequest {
  message: string;
  sessionId?: string;
  requestId: string;
  allowedTools?: string[];
  workingDirectory?: string;
  permissionMode?: "default" | "plan" | "auto-edit" | "yolo";
  model?: string;
}

// Model provider types
export interface ModelConfig {
  id: string;
  name: string;
  baseUrl?: string;
  envKey?: string;
  generationConfig?: {
    extra_body?: Record<string, unknown>;
    contextWindowSize?: number;
  };
}

export interface ModelsResponse {
  models: ModelConfig[];
}

export interface AbortRequest {
  requestId: string;
}

export interface PermissionRespondRequest {
  permissionId: string;
  behavior: "allow" | "deny";
  message?: string;
  updatedInput?: Record<string, unknown>;
  scope?: "specific" | "all";
  // For ask_user_question tool: answers payload
  answers?: Record<string, string>;
}

export interface ProjectInfo {
  path: string;
  encodedName: string;
}

export interface ProjectsResponse {
  projects: ProjectInfo[];
}

// Conversation history types
export interface ConversationSummary {
  sessionId: string;
  startTime: string;
  lastTime: string;
  messageCount: number;
  lastMessagePreview: string;
}

export interface HistoryListResponse {
  conversations: ConversationSummary[];
}

// Conversation history types
// Note: messages are typed as unknown[] to avoid frontend/backend dependency issues
// Frontend should cast to TimestampedSDKMessage[] (defined in frontend/src/types.ts)
export interface ConversationHistory {
  sessionId: string;
  messages: unknown[]; // TimestampedSDKMessage[] in practice, but avoiding frontend type dependency
  metadata: {
    startTime: string;
    endTime: string;
    messageCount: number;
  };
}
