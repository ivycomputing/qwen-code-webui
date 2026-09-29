/**
 * Minimal runtime abstraction layer
 *
 * Simple interfaces for abstracting runtime-specific operations
 * that are used in the backend application.
 */

import type { MiddlewareHandler } from "hono";

// Command execution result
export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

// Simplified runtime interface - only truly platform-specific operations
export interface Runtime {
  // Process execution (different APIs between Deno and Node.js)
  runCommand(
    command: string,
    args: string[],
    options?: {
      env?: Record<string, string>;
      /** Kill the subprocess if it runs longer than this (ms). */
      timeoutMs?: number;
    },
  ): Promise<CommandResult>;
  findExecutable(name: string): Promise<string[]>;

  // Optional: resolve the CLI bundled inside node_modules/@qwen-code/sdk.
  // Only implemented by runtimes where the SDK package is physically present
  // on disk (Node). Deno single-binary builds cannot spawn an embedded cli.js,
  // so they leave this undefined and require a host-installed CLI.
  resolveBundledCliPath?(): string | null;

  // HTTP server (different implementations)
  serve(
    port: number,
    hostname: string,
    handler: (req: Request, env?: unknown) => Response | Promise<Response>,
  ): Promise<void>;

  // Static file serving (different middleware)
  createStaticFileMiddleware(options: { root: string }): MiddlewareHandler;
}
