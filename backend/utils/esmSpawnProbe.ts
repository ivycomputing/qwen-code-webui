// Regression probe: imports spawn the way the SDK does — a static ESM named
// binding resolved at module instantiation time. currentSpawn() reads that
// binding live, so the assertion holds only if syncBuiltinESMExports()
// refreshed an already-linked import (the SDK case), regardless of the order
// in which tests install the registry patch.
import { spawn } from "node:child_process";

export const currentSpawn = (): unknown => spawn;
