/**
 * Backend-specific type definitions
 */

import type { Runtime } from "./runtime/types.ts";

// Application configuration shared across backend handlers
export interface AppConfig {
  debugMode: boolean;
  runtime: Runtime;
  cliPath: string; // Path to actual CLI script detected by validateQwenCli
  tokenSecret?: string; // Secret for Open-ACE integration token validation
  quotaCheckEnabled?: boolean; // Enable quota checking with Open-ACE
  openaceApiUrl?: string; // Open-ACE API URL for quota checking
  // Future configuration options can be added here
}
