import { Context } from "hono";
import type { ModelsResponse, ModelConfig } from "../../shared/types.ts";
import { logger } from "../utils/logger.ts";
import { getHomeDir } from "../utils/os.ts";
import { readFile } from "node:fs/promises";

interface SettingsJson {
  modelProviders?: {
    openai?: ModelConfig[];
  };
}

/**
 * Remove [Bailian Coding Plan] prefix from model name for display
 * @param fullName - Full model name
 * @returns Model name without prefix
 */
function cleanModelName(fullName: string): string {
  return fullName.replace(/^\[Bailian Coding Plan\]\s*/, "");
}

/**
 * Reads ~/.qwen/settings.json and returns available models
 * @param c - Hono context
 * @returns JSON response with models list
 */
export async function handleModelsRequest(c: Context): Promise<Response> {
  try {
    const homeDir = getHomeDir();
    if (!homeDir) {
      return c.json<ModelsResponse>({ models: [] }, 200);
    }

    const settingsPath = `${homeDir}/.qwen/settings.json`;

    try {
      const settingsContent = await readFile(settingsPath, "utf-8");
      const settings: SettingsJson = JSON.parse(settingsContent);

      let models = settings.modelProviders?.openai || [];
      
      // Clean model names for display
      models = models.map(model => ({
        ...model,
        name: cleanModelName(model.name)
      }));

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