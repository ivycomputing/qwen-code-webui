/**
 * Project path mapping utilities
 *
 * Manages the mapping between encoded project names and their actual paths.
 * This is necessary because Qwen Code's encoding (replace all non-alphanumeric
 * chars with '-') is lossy and cannot be reversed for paths containing hyphens.
 */

import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { exists, mkdir, readTextFile, remove, rename, writeTextFile } from "./fs.ts";
import { getHomeDir } from "./os.ts";
import { logger } from "./logger.ts";

const CONFIG_DIR_NAME = ".qwen-code-webui";
const MAPPING_FILE_NAME = "project-mapping.json";

const OLD_MAPPING_FILE_NAME = ".mapping.json";

export interface ProjectPathMapping {
  [encodedName: string]: string;
}

function getConfigDir(): string | null {
  const homeDir = getHomeDir();
  if (!homeDir) {
    return null;
  }
  return join(homeDir, CONFIG_DIR_NAME);
}

function getMappingFilePath(): string | null {
  const configDir = getConfigDir();
  if (!configDir) {
    return null;
  }
  return join(configDir, MAPPING_FILE_NAME);
}

function getOldMappingFilePath(): string | null {
  const homeDir = getHomeDir();
  if (!homeDir) {
    return null;
  }
  return join(homeDir, ".qwen", "projects", OLD_MAPPING_FILE_NAME);
}

async function ensureConfigDir(): Promise<string | null> {
  const configDir = getConfigDir();
  if (!configDir) {
    return null;
  }
  if (!(await exists(configDir))) {
    await mkdir(configDir);
  }
  return configDir;
}

/**
 * One-time migration from ~/.qwen/projects/.mapping.json to ~/.qwen-code-webui/project-mapping.json
 */
async function migrateFromOldPath(): Promise<void> {
  const oldPath = getOldMappingFilePath();
  const newPath = getMappingFilePath();
  if (!oldPath || !newPath) {
    return;
  }

  try {
    if (!(await exists(oldPath))) {
      return;
    }
    if (await exists(newPath)) {
      return;
    }

    const configDir = await ensureConfigDir();
    if (!configDir) {
      return;
    }

    const content = await readTextFile(oldPath);
    JSON.parse(content);

    const tmpPath = join(configDir, `${MAPPING_FILE_NAME}.${randomUUID()}.tmp`);
    await writeTextFile(tmpPath, content);
    await rename(tmpPath, newPath);

    await remove(oldPath);
    logger.api.info("Migrated project mapping from {oldPath} to {newPath}", {
      oldPath,
      newPath,
    });
  } catch (error) {
    logger.api.warn("Failed to migrate project mapping: {error}", { error });
  }
}

export async function readProjectPathMapping(): Promise<ProjectPathMapping> {
  const mappingFilePath = getMappingFilePath();
  if (!mappingFilePath) {
    return {};
  }

  await migrateFromOldPath();

  try {
    if (!(await exists(mappingFilePath))) {
      return {};
    }

    const content = await readTextFile(mappingFilePath);
    return JSON.parse(content) as ProjectPathMapping;
  } catch (error) {
    logger.api.warn("Failed to read project path mapping: {error}", { error });
    return {};
  }
}

/**
 * Write the project path mapping to file using atomic write (tmp + rename).
 */
export async function writeProjectPathMapping(
  mapping: ProjectPathMapping,
): Promise<void> {
  const mappingFilePath = getMappingFilePath();
  if (!mappingFilePath) {
    logger.api.warn(
      "Cannot write project path mapping: home directory not found",
    );
    return;
  }

  try {
    const configDir = await ensureConfigDir();
    if (!configDir) {
      return;
    }

    const tmpPath = join(dirname(mappingFilePath), `${MAPPING_FILE_NAME}.${randomUUID()}.tmp`);
    await writeTextFile(tmpPath, JSON.stringify(mapping, null, 2));
    await rename(tmpPath, mappingFilePath);
  } catch (error) {
    logger.api.error("Failed to write project path mapping: {error}", {
      error,
    });
  }
}

export async function updateProjectPathMapping(
  encodedName: string,
  actualPath: string,
): Promise<void> {
  const mapping = await readProjectPathMapping();
  mapping[encodedName] = actualPath;
  await writeProjectPathMapping(mapping);
}

export async function decodeProjectPath(
  encodedName: string,
  pathExists: (path: string) => Promise<boolean>,
): Promise<string | null> {
  const mapping = await readProjectPathMapping();
  if (mapping[encodedName]) {
    const mappedPath = mapping[encodedName];
    if (await pathExists(mappedPath)) {
      return mappedPath;
    }
    delete mapping[encodedName];
    await writeProjectPathMapping(mapping);
  }

  const decodedPath = await tryHeuristicDecode(encodedName, pathExists);
  if (decodedPath) {
    await updateProjectPathMapping(encodedName, decodedPath);
    return decodedPath;
  }

  return null;
}

// Qwen Code replaces all non-alphanumeric chars (/ \ : . _ -) with '-',
// so the encoding is lossy — the same encoded name could map to multiple paths.
// We try plausible combinations to find one that exists on disk.
async function tryHeuristicDecode(
  encodedName: string,
  pathExists: (path: string) => Promise<boolean>,
): Promise<string | null> {
  if (!encodedName.startsWith("-")) {
    return null;
  }

  const encoded = encodedName.slice(1);

  const simplePath = "/" + encoded.replace(/-/g, "/");
  if (await pathExists(simplePath)) {
    return simplePath;
  }

  const possiblePaths = generatePossiblePaths(encoded);

  for (const path of possiblePaths) {
    if (await pathExists(path)) {
      return path;
    }
  }

  return null;
}

function generatePossiblePaths(encoded: string): string[] {
  const results: string[] = [];
  const segments = encoded.split("-");

  const maxHyphensToTry = 3;

  generateCombinations(segments, 0, [], results, maxHyphensToTry);

  return results.map((path) => "/" + path);
}

function generateCombinations(
  segments: string[],
  index: number,
  current: string[],
  results: string[],
  hyphensRemaining: number,
): void {
  if (index === segments.length) {
    results.push(current.join("/"));
    return;
  }

  const segment = segments[index];

  current.push(segment);
  generateCombinations(segments, index + 1, current, results, hyphensRemaining);
  current.pop();

  if (hyphensRemaining > 0 && index < segments.length - 1) {
    for (let len = 2; len <= Math.min(3, segments.length - index); len++) {
      if (hyphensRemaining >= len - 1) {
        const combined = segments.slice(index, index + len).join("-");
        current.push(combined);
        generateCombinations(
          segments,
          index + len,
          current,
          results,
          hyphensRemaining - (len - 1),
        );
        current.pop();
      }
    }
  }
}
