import assert from "node:assert/strict";
import test from "node:test";

import { addLabels, createPullRequest, parseGitHubRemote, type ProcessRunner } from "./github";

test("parseGitHubRemote obsługuje HTTPS, SCP i adres proxy", () => {
  assert.deepEqual(parseGitHubRemote("https://github.com/OWNER/REPO.git"), { owner: "OWNER", repo: "REPO" });
  assert.deepEqual(parseGitHubRemote("git@github.com:octo/travel.git"), { owner: "octo", repo: "travel" });
  assert.deepEqual(parseGitHubRemote("http://token@127.0.0.1:8123/git/acme/help-travel"), { owner: "acme", repo: "help-travel" });
});

test("PR powstaje wyłącznie przez gh api REST, a błąd etykiety jest best-effort", async () => {
  const calls: Array<{ command: string; args: readonly string[]; input?: string }> = [];
  const runner: ProcessRunner = {
    run: async (command, args, options) => {
      calls.push({ command, args, input: options?.input });
      if (args[1]?.includes("/issues/")) throw new Error("brak etykiety");
      return { stdout: '{"number":7,"html_url":"https://github.com/acme/travel/pull/7"}', stderr: "" };
    },
  };
  const created = await createPullRequest(
    { owner: "acme", repo: "travel", head: "claude/seo-content/x", base: "main", title: "SEO", body: "opis", draft: false },
    runner,
  );
  assert.equal(created.number, 7);
  assert.deepEqual(calls[0].args, ["api", "repos/acme/travel/pulls", "-X", "POST", "--input", "-"]);
  assert.equal(calls[0].args.includes("pr"), false);
  assert.equal(await addLabels({ owner: "acme", repo: "travel", issueNumber: 7, labels: ["seo-automat"] }, runner), false);
});
