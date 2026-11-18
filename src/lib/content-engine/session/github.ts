import { execFile } from "node:child_process";

export interface ProcessRunOptions {
  cwd?: string;
  input?: string;
}

export interface ProcessRunResult {
  stdout: string;
  stderr: string;
}

export interface ProcessRunner {
  run(command: string, args: readonly string[], options?: ProcessRunOptions): Promise<ProcessRunResult>;
}

export class ProcessExecutionError extends Error {
  readonly name = "ProcessExecutionError";

  constructor(
    readonly command: string,
    readonly args: readonly string[],
    readonly stdout: string,
    readonly stderr: string,
    readonly cause?: unknown,
  ) {
    super(`${command} ${args.join(" ")} zakończył się błędem: ${stderr.trim() || "brak komunikatu"}`);
  }
}

export class ExecFileProcessRunner implements ProcessRunner {
  async run(command: string, args: readonly string[], options: ProcessRunOptions = {}): Promise<ProcessRunResult> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        command,
        [...args],
        { cwd: options.cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) reject(new ProcessExecutionError(command, args, stdout, stderr, error));
          else resolve({ stdout, stderr });
        },
      );
      if (options.input !== undefined) child.stdin?.end(options.input);
      else child.stdin?.end();
    });
  }
}

export interface GitHubRepository {
  owner: string;
  repo: string;
}

export function parseGitHubRemote(remote: string): GitHubRepository {
  const value = remote.trim();
  let pathname: string;
  if (/^[^/@\s]+@[^:\s]+:/.test(value)) {
    pathname = value.slice(value.indexOf(":") + 1);
  } else {
    try {
      pathname = new URL(value).pathname;
    } catch {
      pathname = value;
    }
  }
  const segments = pathname
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
  if (segments.length < 2) throw new Error(`Nie można odczytać owner/repo z origin: ${remote}`);
  const owner = segments.at(-2)!;
  const repo = segments.at(-1)!.replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo) || repo === "") {
    throw new Error(`Nieprawidłowy owner/repo w origin: ${remote}`);
  }
  return { owner, repo };
}

export interface CreatePullRequestInput extends GitHubRepository {
  head: string;
  base: string;
  title: string;
  body: string;
  draft: false;
}

export interface CreatedPullRequest {
  number: number;
  url: string;
}

export async function createPullRequest(
  input: CreatePullRequestInput,
  runner: ProcessRunner = new ExecFileProcessRunner(),
  cwd?: string,
): Promise<CreatedPullRequest> {
  const endpoint = `repos/${input.owner}/${input.repo}/pulls`;
  const payload = JSON.stringify({ head: input.head, base: input.base, title: input.title, body: input.body, draft: input.draft });
  const result = await runner.run("gh", ["api", endpoint, "-X", "POST", "--input", "-"], { cwd, input: payload });
  const parsed = JSON.parse(result.stdout) as { number?: unknown; html_url?: unknown; url?: unknown };
  if (!Number.isInteger(parsed.number) || (typeof parsed.html_url !== "string" && typeof parsed.url !== "string")) {
    throw new Error("GitHub REST zwrócił nieprawidłową odpowiedź po utworzeniu PR.");
  }
  return { number: parsed.number as number, url: (parsed.html_url ?? parsed.url) as string };
}

export async function addLabels(
  input: GitHubRepository & { issueNumber: number; labels: readonly string[] },
  runner: ProcessRunner = new ExecFileProcessRunner(),
  cwd?: string,
): Promise<boolean> {
  try {
    await runner.run("gh", ["api", `repos/${input.owner}/${input.repo}/issues/${input.issueNumber}/labels`, "-X", "POST", "--input", "-"], {
      cwd,
      input: JSON.stringify({ labels: input.labels }),
    });
    return true;
  } catch {
    return false;
  }
}

export interface PullRequestState {
  number: number;
  url: string;
  state: "open" | "closed";
  merged: boolean;
}

/** Stan PR (tylko odczyt) — do synchronizacji kolejki tematów po przeglądzie właściciela. */
export async function getPullRequest(
  input: GitHubRepository & { number: number },
  runner: ProcessRunner = new ExecFileProcessRunner(),
  cwd?: string,
): Promise<PullRequestState> {
  const result = await runner.run("gh", ["api", `repos/${input.owner}/${input.repo}/pulls/${input.number}`], { cwd });
  const parsed = JSON.parse(result.stdout) as { number?: unknown; html_url?: unknown; state?: unknown; merged?: unknown; merged_at?: unknown };
  if (!Number.isInteger(parsed.number) || (parsed.state !== "open" && parsed.state !== "closed") || typeof parsed.html_url !== "string") {
    throw new Error(`GitHub REST zwrócił nieprawidłowy opis PR #${input.number}.`);
  }
  return {
    number: parsed.number as number,
    url: parsed.html_url,
    state: parsed.state,
    merged: parsed.merged === true || (typeof parsed.merged_at === "string" && parsed.merged_at !== ""),
  };
}

/** Numer PR z adresu `https://github.com/<owner>/<repo>/pull/<n>` (null, gdy to nie adres PR). */
export function pullRequestNumberFromUrl(url: string): number | null {
  const match = url.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)(?:[/?#].*)?$/);
  return match ? Number(match[1]) : null;
}

export class GitHubClient {
  constructor(
    private readonly runner: ProcessRunner = new ExecFileProcessRunner(),
    private readonly cwd?: string,
  ) {}

  createPullRequest(input: CreatePullRequestInput): Promise<CreatedPullRequest> {
    return createPullRequest(input, this.runner, this.cwd);
  }

  addLabels(input: GitHubRepository & { issueNumber: number; labels: readonly string[] }): Promise<boolean> {
    return addLabels(input, this.runner, this.cwd);
  }

  getPullRequest(input: GitHubRepository & { number: number }): Promise<PullRequestState> {
    return getPullRequest(input, this.runner, this.cwd);
  }
}
