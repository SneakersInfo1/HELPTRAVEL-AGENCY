import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface GitFixture {
  root: string;
  bare: string;
  clone(name: string): Promise<string>;
  cleanup(): Promise<void>;
}

export function git(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", [...args], { cwd, encoding: "utf8", windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(new Error(`git ${args.join(" ")}: ${stderr || error.message}`));
      else resolve(stdout);
    });
  });
}

export async function createGitFixture(prefix = "seo-session-git-"): Promise<GitFixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  const bare = path.join(root, "acme", "travel.git");
  const seed = path.join(root, "seed");
  await mkdir(path.dirname(bare), { recursive: true });
  await git(root, ["init", "--bare", bare]);
  await mkdir(seed, { recursive: true });
  await git(seed, ["init", "-b", "main"]);
  await writeFile(path.join(seed, "README.md"), "fixture\n", "utf8");
  await writeFile(path.join(seed, ".gitignore"), ".seo-session/\n.seo-engine-state/\n", "utf8");
  await mkdir(path.join(seed, "content", "seo"), { recursive: true });
  await writeFile(path.join(seed, "content", "seo", "index.generated.ts"), "export const CONTENT_DOCUMENTS: unknown[] = [];\n", "utf8");
  await git(seed, ["add", "."]);
  await git(seed, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-m", "seed"]);
  await git(seed, ["remote", "add", "origin", bare]);
  await git(seed, ["push", "-u", "origin", "main"]);

  return {
    root,
    bare,
    clone: async (name: string) => {
      const target = path.join(root, name);
      await git(root, ["clone", "--branch", "main", bare, target]);
      const publicRemote = "https://github.com/acme/travel.git";
      await git(target, ["remote", "set-url", "origin", publicRemote]);
      await git(target, ["config", `url.${pathToFileURL(bare).href}.insteadOf`, publicRemote]);
      return target;
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
