import { App, Octokit } from "npm:octokit";

const runNumber = +Deno.env.get("runNumber")!,
  githubToken = Deno.env.get("githubToken")!,
  repo = Deno.env.get("repo")!,
  [owner, repoName] = repo.split("/");

type status =
  | "completed"
  | "action_required"
  | "cancelled"
  | "failure"
  | "neutral"
  | "skipped"
  | "stale"
  | "success"
  | "timed_out"
  | "in_progress"
  | "queued"
  | "requested"
  | "waiting"
  | "pending";

// 得到 workflow id
const octokit = new Octokit({ auth: githubToken });
const workflow = await octokit.rest.actions.getWorkflowRun({
  owner,
  repo: repoName,
  run_id: runNumber,
});
const workflowId = workflow.data.workflow_id;

// 获取 workflow run 列表
const list = await octokit.rest.actions.listWorkflowRuns({
  owner,
  repo: repoName,
  workflow_id: workflowId,
});
const data = list.data.workflow_runs;
for (const i of data) {
  if (!["in_progress"].includes(i.status ?? "")) continue;
  const updatedAt = new Date(i.updated_at);
  if (updatedAt.getTime() >= Date.now()) continue;
  octokit.hook("workflow_job", (e) => {
    console.log(e);
  }, {});
}
