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
}
