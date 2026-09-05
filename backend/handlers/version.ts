/**
 * Version handler
 *
 * Returns the application version from package.json
 */

import { VERSION, COMMIT, BUILD_TIME } from "../cli/version.ts";

export function handleVersionRequest(): Response {
  return Response.json({
    version: VERSION,
    commit: COMMIT,
    buildTime: BUILD_TIME,
  });
}