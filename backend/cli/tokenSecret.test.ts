import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTokenSecret } from "./tokenSecret.ts";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, {recursive:true, force:true}); });
function fixture(value: string): string {
  const directory = mkdtempSync(join(tmpdir(), "webui-secret-")); directories.push(directory);
  const file = join(directory,"key"); writeFileSync(file,value,{mode:0o600}); return file;
}
describe("file-based token secret", () => {
  it("preserves standalone and legacy inline configuration", () => {
    expect(readTokenSecret()).toBeUndefined();
    expect(readTokenSecret("legacy")).toBe("legacy");
  });
  it("reads a private file and rejects ambiguous sources", () => {
    const file=fixture("x".repeat(32)+"\n");
    expect(readTokenSecret(undefined,file)).toBe("x".repeat(32));
    expect(() => readTokenSecret("inline",file)).toThrow("Choose one token secret source");
    if (process.platform !== "win32") {
      chmodSync(file,0o644);
      expect(() => readTokenSecret(undefined,file)).toThrow("unavailable or insecure");
    }
  });
  it("rejects missing, short, oversized and multiline secrets without echoing values", () => {
    for (const value of ["private-short", "x".repeat(4097), "x".repeat(32)+"\nprivate-second-line"]) {
      expect(() => readTokenSecret(undefined,fixture(value))).toThrow("Token secret file unavailable or insecure");
    }
    expect(() => readTokenSecret(undefined,"/missing-file")).toThrow("Token secret file unavailable or insecure");
  });
});
