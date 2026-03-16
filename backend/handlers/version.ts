/**
 * Version handler
 *
 * Returns the application version from package.json
 */

import { VERSION } from "../cli/version.ts";

export function handleVersionRequest(): Response {
  return Response.json({ version: VERSION });
}