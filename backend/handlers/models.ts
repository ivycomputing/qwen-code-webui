import { Context } from "hono";
import type { ModelsResponse, ModelConfig } from "../../shared/types.ts";
import { logger } from "../utils/logger.ts";

interface SettingsJson {
  modelProviders?: {
    openai?: ModelConfig[];
  };
}

/**
 * Reads ~/.qwen/settings.json and returns available models
 * @param c - Hono context
 * @returns JSON response with models list
 */
export async function handleModelsRequest(c: Context): Promise<Response> {
  try {
    const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
    if (!homeDir) {
      return c.json<ModelsResponse>({ models: [] }, 200);
    }

    const settingsPath = `${homeDir}/.qwen/settings.json`;
    
    try {
      const settingsContent = await Deno.readTextFile(settingsPath);
      const settings: SettingsJson = JSON.parse(settingsContent);
      
      const models = settings.modelProviders?.openai || [];
      
      logger.models.debug("Loaded {count} models from settings.json", { 
        count: models.length 
      });
      
      return c.json<ModelsResponse>({ models }, 200);
    } catch (fileError) {
      // File doesn't exist or can't be read
      logger.models.debug("Could not read settings.json: {error}", { 
        error: fileError 
      });
      return c.json<ModelsResponse>({ models: [] }, 200);
    }
  } catch (error) {
    logger.models.error("Error loading models: {error}", { error });
    return c.json<ModelsResponse>({ models: [] }, 200);
  }
}