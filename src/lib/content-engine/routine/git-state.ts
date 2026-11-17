import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_STATE_BRANCH = "claude/seo-engine-state";
const STATE_FOLDERS = ["idempotency", "pending", "dead-letter"] as const;
const GIT_NAME = "HelpTravel SEO routine";
const GIT_EMAIL = "seo-routine@users.noreply.github.com";

export interface GitRunOptions {
  cwd?: string;
  input?: string;
}

export interface GitRunResult {
  stdout: string;
  stderr: string;
}

export interface GitRunner {
  run(args: readonly string[], options?: GitRunOptions): Promise<GitRunResult>;
}

export class GitCommandError extends Error {
  readonly name = "GitCommandError";

  constructor(
    readonly args: readonly string[],
    readonly stdout: string,
    readonly stderr: string,
    readonly cause?: unknown,
  ) {
    super(`git ${args.join(" ")} zakończył się błędem: ${stderr.trim() || "brak komunikatu"}`);
  }
}

export class ExecFileGitRunner implements GitRunner {
  constructor(private readonly defaultCwd?: string) {}

  async run(args: readonly string[], options: GitRunOptions = {}): Promise<GitRunResult> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        "git",
        [...args],
        { cwd: options.cwd ?? this.defaultCwd, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) reject(new GitCommandError(args, stdout, stderr, error));
          else resolve({ stdout, stderr });
        },
      );
      if (options.input !== undefined) child.stdin?.end(options.input);
      else child.stdin?.end();
    });
  }
}

export function assertStateBranch(branch: string): void {
  if (!branch.startsWith("claude/") || !/^claude\/[A-Za-z0-9._/-]+$/.test(branch) || branch.includes("..")) {
    throw new Error(`Gałąź stanu musi zaczynać się od claude/: ${branch}`);
  }
}

export interface StateClaim {
  day: string;
  runId: string;
  claimedAt: string;
}

export type ClaimDayResult = { status: "claimed"; claim: StateClaim } | { status: "duplicate"; previous: StateClaim };

export interface ProposalBranch {
  branch: string;
  day: string;
  slug: string;
}

export interface GitStateOptions {
  cwd?: string;
  stateBranch?: string;
  runner?: GitRunner;
  now?: () => Date;
  worktreeDir?: string;
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function within(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export class GitState {
  readonly cwd: string;
  private branch: string;
  private readonly runner: GitRunner;
  private readonly now: () => Date;
  private readonly worktreeDir: string;
  private restoredFiles = new Set<string>();

  constructor(options: GitStateOptions = {}) {
    this.cwd = path.resolve(options.cwd ?? process.cwd());
    this.branch = options.stateBranch ?? DEFAULT_STATE_BRANCH;
    assertStateBranch(this.branch);
    this.runner = options.runner ?? new ExecFileGitRunner(this.cwd);
    this.now = options.now ?? (() => new Date());
    this.worktreeDir = path.resolve(this.cwd, options.worktreeDir ?? path.join(".seo-routine", "state-worktree"));
    if (!within(this.cwd, this.worktreeDir)) throw new Error("Worktree stanu musi znajdować się wewnątrz repozytorium.");
  }

  get stateBranch(): string {
    return this.branch;
  }

  useStateBranch(branch: string): void {
    assertStateBranch(branch);
    this.branch = branch;
  }

  private git(args: readonly string[], cwd = this.cwd): Promise<GitRunResult> {
    return this.runner.run(args, { cwd });
  }

  private async remoteStateExists(): Promise<boolean> {
    const result = await this.git(["ls-remote", "--heads", "origin", `refs/heads/${this.branch}`]);
    return result.stdout.trim() !== "";
  }

  private async fetchState(): Promise<void> {
    await this.git(["fetch", "origin", `+refs/heads/${this.branch}:refs/remotes/origin/${this.branch}`]);
  }

  private async cleanupWorktree(orphanBranch?: string): Promise<void> {
    try {
      await this.git(["worktree", "remove", "--force", this.worktreeDir]);
    } catch {
      // Nieistniejący albo niedokończony worktree sprzątamy bezpośrednio niżej.
    }
    await fs.rm(this.worktreeDir, { recursive: true, force: true });
    try {
      await this.git(["worktree", "prune"]);
    } catch {
      // Prune jest porządkiem pomocniczym, a nie częścią transakcji stanu.
    }
    if (orphanBranch) {
      try {
        await this.git(["branch", "-D", orphanBranch]);
      } catch {
        // Gałąź może już nie istnieć po niepełnym tworzeniu worktree.
      }
    }
  }

  private async openStateWorktree(): Promise<{ orphanBranch?: string }> {
    await this.cleanupWorktree();
    await fs.mkdir(path.dirname(this.worktreeDir), { recursive: true });
    if (await this.remoteStateExists()) {
      await this.fetchState();
      await this.git(["worktree", "add", "--detach", "--force", this.worktreeDir, `refs/remotes/origin/${this.branch}`]);
      return {};
    }

    const orphanBranch = `seo-state-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await this.git(["worktree", "add", "--detach", "--force", this.worktreeDir, "HEAD"]);
    await this.git(["checkout", "--orphan", orphanBranch], this.worktreeDir);
    for (const entry of await fs.readdir(this.worktreeDir)) {
      if (entry === ".git") continue;
      await fs.rm(path.join(this.worktreeDir, entry), { recursive: true, force: true });
    }
    return { orphanBranch };
  }

  private async commit(message: string, cwd = this.worktreeDir): Promise<boolean> {
    await this.git(["add", "--all"], cwd);
    const status = await this.git(["status", "--porcelain"], cwd);
    if (status.stdout.trim() === "") return false;
    await this.git(["-c", `user.name=${GIT_NAME}`, "-c", `user.email=${GIT_EMAIL}`, "commit", "-m", message], cwd);
    return true;
  }

  private async pushState(): Promise<void> {
    await this.git(["push", "origin", `HEAD:refs/heads/${this.branch}`], this.worktreeDir);
  }

  private async stateFiles(root: string): Promise<Set<string>> {
    const result = new Set<string>();
    const visit = async (relative: string): Promise<void> => {
      const directory = path.join(root, relative);
      let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
      try {
        entries = await fs.readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (isMissing(error)) return;
        throw error;
      }
      for (const entry of entries) {
        const child = path.join(relative, entry.name);
        if (entry.isDirectory()) await visit(child);
        else if (entry.isFile()) result.add(child);
      }
    };
    for (const folder of STATE_FOLDERS) await visit(folder);
    return result;
  }

  async restoreState(stateDir: string): Promise<void> {
    const destination = path.resolve(this.cwd, stateDir);
    for (const folder of STATE_FOLDERS) await fs.rm(path.join(destination, folder), { recursive: true, force: true });
    await fs.mkdir(destination, { recursive: true });
    if (!(await this.remoteStateExists())) {
      this.restoredFiles = new Set();
      return;
    }

    const opened = await this.openStateWorktree();
    try {
      for (const folder of STATE_FOLDERS) {
        const source = path.join(this.worktreeDir, folder);
        try {
          await fs.cp(source, path.join(destination, folder), { recursive: true, force: true });
        } catch (error) {
          if (!isMissing(error)) throw error;
        }
      }
      this.restoredFiles = await this.stateFiles(destination);
    } finally {
      await this.cleanupWorktree(opened.orphanBranch);
    }
  }

  async claimDay(day: string, runId: string): Promise<ClaimDayResult> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Nieprawidłowy dzień claim: ${day}`);
    if (runId.trim() === "") throw new Error("runId nie może być pusty.");

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const opened = await this.openStateWorktree();
      try {
        const target = path.join(this.worktreeDir, "claims", `${day}.json`);
        try {
          const previous = JSON.parse(await fs.readFile(target, "utf8")) as StateClaim;
          return { status: "duplicate", previous };
        } catch (error) {
          if (!isMissing(error)) throw error;
        }

        const claim: StateClaim = { day, runId, claimedAt: this.now().toISOString() };
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, `${JSON.stringify(claim, null, 2)}\n`, "utf8");
        await this.commit(`SEO routine: claim ${day}`);
        try {
          await this.pushState();
          return { status: "claimed", claim };
        } catch (error) {
          lastError = error;
        }
      } finally {
        await this.cleanupWorktree(opened.orphanBranch);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Nie udało się zapisać claim po trzech próbach.");
  }

  async persistState(stateDir: string, message: string): Promise<void> {
    const sourceRoot = path.resolve(this.cwd, stateDir);
    const currentFiles = await this.stateFiles(sourceRoot);
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const opened = await this.openStateWorktree();
      try {
        for (const relative of this.restoredFiles) {
          if (!currentFiles.has(relative)) await fs.rm(path.join(this.worktreeDir, relative), { force: true });
        }
        for (const folder of STATE_FOLDERS) {
          const source = path.join(sourceRoot, folder);
          try {
            await fs.cp(source, path.join(this.worktreeDir, folder), { recursive: true, force: true });
          } catch (error) {
            if (!isMissing(error)) throw error;
          }
        }
        const changed = await this.commit(message);
        if (!changed) {
          this.restoredFiles = currentFiles;
          return;
        }
        try {
          await this.pushState();
          this.restoredFiles = currentFiles;
          return;
        } catch (error) {
          lastError = error;
        }
      } finally {
        await this.cleanupWorktree(opened.orphanBranch);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Nie udało się utrwalić stanu po trzech próbach.");
  }

  async listProposalBranches(): Promise<ProposalBranch[]> {
    const result = await this.git(["ls-remote", "--heads", "origin", "refs/heads/claude/seo-content/*"]);
    const branches: ProposalBranch[] = [];
    for (const line of result.stdout.split(/\r?\n/)) {
      const ref = line.split(/\s+/)[1];
      const match = ref?.match(/^refs\/heads\/(claude\/seo-content\/(\d{4}-\d{2}-\d{2})-(.+))$/);
      if (match) branches.push({ branch: match[1], day: match[2], slug: match[3] });
    }
    return branches.sort((left, right) => right.day.localeCompare(left.day) || left.branch.localeCompare(right.branch));
  }

  async listClaims(limit = 10): Promise<StateClaim[]> {
    if (!(await this.remoteStateExists())) return [];
    const opened = await this.openStateWorktree();
    try {
      const directory = path.join(this.worktreeDir, "claims");
      let names: string[];
      try {
        names = await fs.readdir(directory);
      } catch (error) {
        if (isMissing(error)) return [];
        throw error;
      }
      const claims: StateClaim[] = [];
      for (const name of names.filter((entry) => entry.endsWith(".json")).sort().reverse().slice(0, limit)) {
        claims.push(JSON.parse(await fs.readFile(path.join(directory, name), "utf8")) as StateClaim);
      }
      return claims;
    } finally {
      await this.cleanupWorktree(opened.orphanBranch);
    }
  }

  async statusPorcelain(): Promise<string> {
    return (await this.git(["status", "--porcelain", "--untracked-files=all"])).stdout;
  }

  async remoteUrl(): Promise<string> {
    return (await this.git(["remote", "get-url", "origin"])).stdout.trim();
  }

  async createAndPushProposalBranch(branch: string, message: string): Promise<void> {
    if (!/^claude\/seo-content\/\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/.test(branch)) {
      throw new Error(`Nieprawidłowa gałąź propozycji: ${branch}`);
    }
    await this.git(["checkout", "-b", branch]);
    await this.git(["add", "--", "content/seo"]);
    const status = await this.git(["status", "--porcelain", "--", "content/seo"]);
    if (status.stdout.trim() === "") throw new Error("Brak zmian content/seo do opublikowania.");
    await this.git(["-c", `user.name=${GIT_NAME}`, "-c", `user.email=${GIT_EMAIL}`, "commit", "-m", message]);
    await this.git(["push", "origin", `HEAD:refs/heads/${branch}`]);
  }
}
