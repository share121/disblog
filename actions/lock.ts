import { App, Octokit } from "npm:octokit";

const actionId = Deno.env.get("actionId")!,
  githubToken = Deno.env.get("githubToken")!,
  repo = Deno.env.get("repo")!,
  [owner, repoName] = repo.split("/");

const octokit = new Octokit({ auth: githubToken });
const list = await octokit.rest.actions.listWorkflowRunsForRepo({
  owner,
  repo: repoName,
});
console.log(list);
