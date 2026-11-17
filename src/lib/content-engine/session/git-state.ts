import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_STATE_BRANCH = "claude/seo-engine-state";
// `daily` = kolejka tematów i dziennik sesji (session/daily-state.ts): pamięć między sesjami.
export const STATE_FOLDERS = ["idempotency", "pending", "dead-letter", "daily"] as const;
export type StateFolder = (typeof STATE_FOLDERS)[number];
/** Gałęzie propozycji: dawne automatu (`seo-content`) i sesji ręcznych (`seo-daily`). */
const PROPOSAL_BRANCH = /^claude\/seo-(?:content|daily)\/(\d{4}-\d{2}-\d{2})(?:-(\d+))?(?:-([a-z0-9][a-z0-9-]*))?$/;

/**
 * Pliki, których publikacja z sesji nie może zmienić bez właściciela: polityka indeksu,
 * robots, sitemap, przekierowania, konfiguracja buildu i CI, zależności, ustawienia Claude.
 */
export const PROTECTED_PATHS: readonly string[] = [
  "src/lib/mvp/month-index-policy.ts",
  "src/lib/mvp/month-index-baseline.ts",
  "src/app/robots.ts",
  "src/app/sitemap.ts",
  "src/middleware.ts",
  "middleware.ts",
  "next.config.ts",
  "vercel.json",
  "public/robots.txt",
  "package.json",
  "pnpm-lock.yaml",
  ".github/",
  ".claude/",
];

export function isProtectedPath(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  return PROTECTED_PATHS.some((protectedPath) => (protectedPath.endsWith("/") ? normalized.startsWith(protectedPath) : normalized === protectedPath));
}
const GIT_NAME = "HelpTravel SEO daily";
const GIT_EMAIL = "seo-daily@users.noreply.github.com";

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

/** Dodana linia w zmianach gałęzi sesji względem bazy (do strażnika polityki indeksu). */
export interface AddedLine {
  file: string;
  line: string;
}

/** Wszystkie zmiany gałęzi sesji względem bazy: zatwierdzone, niezatwierdzone i nowe pliki. */
export interface SessionChanges {
  files: string[];
  added: AddedLine[];
}

/** Nowe pliki większe niż ten limit nie są czytane linia po linii (to nie są pliki kodu ani treści). */
const MAX_SCANNED_FILE_BYTES = 2 * 1024 * 1024;

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
    this.worktreeDir = path.resolve(this.cwd, options.worktreeDir ?? path.join(".seo-session", "state-worktree"));
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

  private async stateFiles(root: string, folders: readonly StateFolder[] = STATE_FOLDERS): Promise<Set<string>> {
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
    for (const folder of folders) await visit(folder);
    return result;
  }

  /**
   * Odtwarza stan z gałęzi stanu. `folders` zawęża odtwarzanie (np. tylko `daily`), żeby
   * polecenia kolejki i dziennika nie nadpisały niezapisanych jeszcze zmian rejestru zadań.
   */
  async restoreState(stateDir: string, folders: readonly StateFolder[] = STATE_FOLDERS): Promise<void> {
    const destination = path.resolve(this.cwd, stateDir);
    for (const folder of folders) await fs.rm(path.join(destination, folder), { recursive: true, force: true });
    await fs.mkdir(destination, { recursive: true });
    if (!(await this.remoteStateExists())) {
      this.restoredFiles = new Set();
      return;
    }

    const opened = await this.openStateWorktree();
    try {
      for (const folder of folders) {
        const source = path.join(this.worktreeDir, folder);
        try {
          await fs.cp(source, path.join(destination, folder), { recursive: true, force: true });
        } catch (error) {
          if (!isMissing(error)) throw error;
        }
      }
      this.restoredFiles = await this.stateFiles(destination, folders);
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
        await this.commit(`SEO daily: claim ${day}`);
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

  async persistState(stateDir: string, message: string, folders: readonly StateFolder[] = STATE_FOLDERS): Promise<void> {
    const sourceRoot = path.resolve(this.cwd, stateDir);
    const currentFiles = await this.stateFiles(sourceRoot, folders);
    const inScope = (relative: string) => folders.some((folder) => relative === folder || relative.startsWith(`${folder}${path.sep}`));
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const opened = await this.openStateWorktree();
      try {
        for (const relative of this.restoredFiles) {
          if (inScope(relative) && !currentFiles.has(relative)) await fs.rm(path.join(this.worktreeDir, relative), { force: true });
        }
        for (const folder of folders) {
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
    const result = await this.git(["ls-remote", "--heads", "origin", "refs/heads/claude/seo-content/*", "refs/heads/claude/seo-daily/*"]);
    const branches: ProposalBranch[] = [];
    for (const line of result.stdout.split(/\r?\n/)) {
      const ref = line.split(/\s+/)[1]?.replace(/^refs\/heads\//, "");
      const match = ref?.match(PROPOSAL_BRANCH);
      if (ref && match) branches.push({ branch: ref, day: match[1], slug: match[3] ?? "" });
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

  async currentBranch(): Promise<string> {
    return (await this.git(["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
  }

  /**
   * Commit i push propozycji. Gdy sesja pracuje już na gałęzi `claude/seo-daily/…`,
   * propozycja zostaje na niej (bez nowej gałęzi). `paths` to dokładna lista plików do
   * commitu — sprawdzona wcześniej względem `PROTECTED_PATHS`. Push nigdy z `--force`.
   */
  async createAndPushProposalBranch(branch: string, message: string, paths: readonly string[] = ["content/seo"]): Promise<void> {
    if (!PROPOSAL_BRANCH.test(branch)) throw new Error(`Nieprawidłowa gałąź propozycji: ${branch}`);
    const forbidden = paths.filter((file) => isProtectedPath(file));
    if (forbidden.length > 0) throw new Error(`Publikacja odmawia plików chronionych: ${forbidden.join(", ")}`);
    if ((await this.currentBranch()) !== branch) await this.git(["checkout", "-b", branch]);
    // Pusta lista = wszystko jest już zatwierdzone na gałęzi sesji; samo `git add --all --`
    // dodałoby wtedy CAŁE drzewo robocze, więc w ogóle go nie wywołujemy.
    if (paths.length > 0) {
      await this.git(["add", "--all", "--", ...paths]);
      const staged = await this.git(["diff", "--cached", "--name-only"]);
      if (staged.stdout.trim() !== "") {
        await this.git(["-c", `user.name=${GIT_NAME}`, "-c", `user.email=${GIT_EMAIL}`, "commit", "-m", message]);
      }
    }
    await this.git(["push", "origin", `HEAD:refs/heads/${branch}`]);
  }

  /**
   * Zmiany gałęzi sesji względem `origin/<base>` (od wspólnego przodka): pliki zatwierdzone,
   * niezatwierdzone i nowe oraz dodane linie. Publikacja sprawdza CAŁOŚĆ — także commity
   * zrobione w sesji przed `publish`, żeby nie dało się ominąć listy plików chronionych.
   */
  async changesSinceBase(base: string): Promise<SessionChanges> {
    const baseRef = `refs/remotes/origin/${base}`;
    try {
      await this.git(["rev-parse", "--verify", "--quiet", baseRef]);
    } catch {
      throw new Error(`Brak ${baseRef} — uruchom \`git fetch origin ${base}\`.`);
    }
    const mergeBase = (await this.git(["merge-base", baseRef, "HEAD"])).stdout.trim();
    const lines = (text: string) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const tracked = lines((await this.git(["-c", "core.quotePath=false", "diff", "--name-only", "--no-renames", mergeBase])).stdout);
    const untracked = lines((await this.git(["-c", "core.quotePath=false", "ls-files", "--others", "--exclude-standard"])).stdout);
    const added: AddedLine[] = [];
    let current: string | null = null;
    for (const line of (await this.git(["-c", "core.quotePath=false", "diff", "-U0", "--no-renames", "--no-color", mergeBase])).stdout.split(/\r?\n/)) {
      if (line.startsWith("+++ ")) current = line === "+++ /dev/null" ? null : line.slice(4).replace(/^b\//, "");
      else if (current && line.startsWith("+")) added.push({ file: current, line: line.slice(1) });
    }
    for (const file of untracked) {
      const full = path.join(this.cwd, file);
      try {
        if ((await fs.stat(full)).size > MAX_SCANNED_FILE_BYTES) continue;
        for (const line of (await fs.readFile(full, "utf8")).split(/\r?\n/)) added.push({ file, line });
      } catch {
        // Plik zniknął albo nie jest czytelny — lista plików i tak go obejmuje.
      }
    }
    const files = [...new Set([...tracked, ...untracked].map((file) => file.replace(/\\/g, "/")))];
    return { files, added };
  }
}
