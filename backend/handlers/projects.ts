import { Context } from "hono";
import type { ProjectInfo, ProjectsResponse } from "../../shared/types.ts";
import { logger } from "../utils/logger.ts";
import { readDir, stat } from "../utils/fs.ts";
import { getHomeDir } from "../utils/os.ts";

/**
 * Handles GET /api/projects requests
 * Retrieves list of available project directories from ~/.qwen/projects directory
 * @param c - Hono context object
 * @returns JSON response with projects array
 */
export async function handleProjectsRequest(c: Context) {
  try {
    const homeDir = getHomeDir();
    if (!homeDir) {
      return c.json({ error: "Home directory not found" }, 500);
    }

    // Qwen Code stores project histories in ~/.qwen/projects/
    const projectsDir = `${homeDir}/.qwen/projects`;

    try {
      // Check if projects directory exists
      const dirInfo = await stat(projectsDir);
      if (!dirInfo.isDirectory) {
        const response: ProjectsResponse = { projects: [] };
        return c.json(response);
      }

      // Read all directories in ~/.qwen/projects
      const projects: ProjectInfo[] = [];
      for await (const entry of readDir(projectsDir)) {
        if (entry.isDirectory) {
          // Directory names are encoded project paths (e.g., "-Users-rhuang-workspace")
          const encodedName = entry.name;

          // Convert encoded name back to path
          // Encoded format: "-" + path with "/", "\", ":", ".", "_" replaced by "-"
          // We need to decode it back to the original path
          const decodedPath = decodeProjectPath(encodedName);

          projects.push({
            path: decodedPath,
            encodedName,
          });
        }
      }

      const response: ProjectsResponse = { projects };
      return c.json(response);
    } catch (error) {
      // Handle file not found errors in a cross-platform way
      if (error instanceof Error && error.message.includes("No such file")) {
        const response: ProjectsResponse = { projects: [] };
        return c.json(response);
      }
      throw error;
    }
  } catch (error) {
    logger.api.error("Error reading projects: {error}", { error });
    return c.json({ error: "Failed to read projects" }, 500);
  }
}

/**
 * Decode an encoded project name back to its original path
 * The encoding replaces "/", "\", ":", ".", "_" with "-"
 * Since this is lossy, we make a best effort to reconstruct the path
 */
function decodeProjectPath(encodedName: string): string {
  // The encoded name starts with "-" (representing the leading "/" in Unix paths)
  // e.g., "-Users-rhuang-workspace" -> "/Users/rhuang/workspace"

  // For macOS/Linux paths, the pattern is predictable:
  // - Starts with "-" (the leading "/")
  // - Each "-" could be "/", "\", ":", ".", or "_"

  // We'll use a heuristic: assume most "-" are "/" for Unix paths
  // This works well for typical paths like /Users/username/workspace

  // Remove leading "-" and replace remaining "-" with "/"
  let decoded = encodedName;
  if (decoded.startsWith("-")) {
    decoded = decoded.slice(1);
  }

  // Replace "-" with "/" - this is a simplification but works for most cases
  decoded = decoded.replace(/-/g, "/");

  // Add leading "/" back
  decoded = "/" + decoded;

  return decoded;
}
