/**
 * Project path mapping utilities
 *
 * Manages the mapping between encoded project names and their actual paths.
 * This is necessary because Qwen Code's encoding (replace all non-alphanumeric
 * chars with '-') is lossy and cannot be reversed for paths containing hyphens.
 */

import { join } from "node:path";
import { exists, readTextFile, writeTextFile } from "./fs.ts";
import { getHomeDir } from "./os.ts";
import { logger } from "./logger.ts";

/**
 * Mapping file name stored in ~/.qwen/projects/
 */
const MAPPING_FILE_NAME = ".mapping.json";

/**
 * Project path mapping structure
 * Maps encoded project names to their actual paths
 */
export interface ProjectPathMapping {
  [encodedName: string]: string;
}

/**
 * Get the path to the mapping file
 */
function getMappingFilePath(): string | null {
  const homeDir = getHomeDir();
  if (!homeDir) {
    return null;
  }
  return join(homeDir, ".qwen", "projects", MAPPING_FILE_NAME);
}

/**
 * Read the project path mapping from file
 */
export async function readProjectPathMapping(): Promise<ProjectPathMapping> {
  const mappingFilePath = getMappingFilePath();
  if (!mappingFilePath) {
    return {};
  }

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
 * Write the project path mapping to file
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
    await writeTextFile(mappingFilePath, JSON.stringify(mapping, null, 2));
  } catch (error) {
    logger.api.error("Failed to write project path mapping: {error}", {
      error,
    });
  }
}

/**
 * Update the mapping for a single project
 */
export async function updateProjectPathMapping(
  encodedName: string,
  actualPath: string,
): Promise<void> {
  const mapping = await readProjectPathMapping();
  mapping[encodedName] = actualPath;
  await writeProjectPathMapping(mapping);
}

/**
 * Try to decode an encoded project name to its actual path
 * Uses multiple strategies:
 * 1. Check if the path is stored in the mapping file
 * 2. Try heuristic decoding and verify if the path exists
 *
 * @param encodedName - The encoded project name (e.g., "-Users-rhuang-workspace-ai-token-analyzer")
 * @param pathExists - A function to check if a path exists
 * @returns The decoded path, or null if cannot be determined
 */
export async function decodeProjectPath(
  encodedName: string,
  pathExists: (path: string) => Promise<boolean>,
): Promise<string | null> {
  // Strategy 1: Check mapping file first
  const mapping = await readProjectPathMapping();
  if (mapping[encodedName]) {
    const mappedPath = mapping[encodedName];
    // Verify the mapped path still exists
    if (await pathExists(mappedPath)) {
      return mappedPath;
    }
    // Path no longer exists, remove from mapping
    delete mapping[encodedName];
    await writeProjectPathMapping(mapping);
  }

  // Strategy 2: Try heuristic decoding
  const decodedPath = await tryHeuristicDecode(encodedName, pathExists);
  if (decodedPath) {
    // Store the successful mapping for future use
    await updateProjectPathMapping(encodedName, decodedPath);
    return decodedPath;
  }

  return null;
}

/**
 * Try heuristic decoding strategies
 *
 * The encoding replaces all non-alphanumeric characters with '-':
 * - "/" -> "-"
 * - "-" (hyphen in original path) -> "-"
 * - "." -> "-"
 * - "_" -> "-"
 * - etc.
 *
 * We try different combinations to find a path that exists.
 */
async function tryHeuristicDecode(
  encodedName: string,
  pathExists: (path: string) => Promise<boolean>,
): Promise<string | null> {
  // Remove leading "-" (represents the leading "/" in Unix paths)
  if (!encodedName.startsWith("-")) {
    return null;
  }

  const encoded = encodedName.slice(1);

  // Strategy 2a: Try simple decode (all "-" -> "/")
  // This works for paths without hyphens
  const simplePath = "/" + encoded.replace(/-/g, "/");
  if (await pathExists(simplePath)) {
    return simplePath;
  }

  // Strategy 2b: Try to find the correct path by exploring combinations
  // We use a recursive approach to try different interpretations of "-"
  const possiblePaths = generatePossiblePaths(encoded);

  for (const path of possiblePaths) {
    if (await pathExists(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Generate possible decoded paths from an encoded string
 *
 * This generates paths by treating each "-" as either:
 * - A path separator "/"
 * - An original hyphen "-"
 *
 * To avoid exponential explosion, we limit the number of hyphens we try
 * to interpret as original hyphens.
 */
function generatePossiblePaths(encoded: string): string[] {
  const results: string[] = [];
  const segments = encoded.split("-");

  // Limit the number of combinations to avoid performance issues
  // We'll try treating up to 3 hyphens as original hyphens
  const maxHyphensToTry = 3;

  // Generate combinations where some "-" are treated as hyphens
  generateCombinations(segments, 0, [], results, maxHyphensToTry);

  // Prepend "/" to make absolute paths
  return results.map((path) => "/" + path);
}

/**
 * Recursively generate path combinations
 */
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

  // Always try treating "-" as "/"
  current.push(segment);
  generateCombinations(segments, index + 1, current, results, hyphensRemaining);
  current.pop();

  // If we have hyphens remaining, try treating "-" as original hyphen
  // (join current segment with next segment(s) using "-")
  if (hyphensRemaining > 0 && index < segments.length - 1) {
    // Try joining with 1, 2, or more consecutive segments
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
