// Regression probe: imports spawn the way the SDK does — a static ESM named
// binding resolved at module instantiation time, before any runtime patching.
import { spawn } from "node:child_process";

export const esmSpawn: unknown = spawn;
