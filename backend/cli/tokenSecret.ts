import { Buffer } from "node:buffer";
import process from "node:process";
import { openSync, fstatSync, readSync, closeSync } from "node:fs";
import { Buffer } from "node:buffer";
import process from "node:process";

/** File-based secrets avoid exposing credentials in command-line arguments. */
export function readTokenSecret(inline?: string, file?: string): string | undefined {
  if (inline !== undefined && file !== undefined) throw new Error("Choose one token secret source");
  if (file === undefined) return inline;
  let fd: number | undefined;
  try {
    fd = openSync(file, "r");
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 4096 || (process.platform !== "win32" && (stat.mode & 0o077) !== 0)) {
      throw new Error("invalid secret file");
    }
    const buffer = Buffer.alloc(4097);
    const size = readSync(fd, buffer, 0, buffer.length, 0);
    const secret = buffer.subarray(0, size).toString("utf8").trim();
    if (size > 4096 || Buffer.byteLength(secret) < 32 || /[\r\n]/.test(secret)) throw new Error("invalid secret file");
    return secret;
  } catch {
    // Neither paths nor file content belong in startup errors.
    throw new Error("Token secret file unavailable or insecure");
  } finally { if (fd !== undefined) closeSync(fd); }
}
