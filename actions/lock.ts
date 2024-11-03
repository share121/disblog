import github from "npm:@actions/github";

const runNumber = +Deno.env.get("runNumber")!,
  githubToken = Deno.env.get("githubToken")!,
  repo = Deno.env.get("repo")!,
  [owner, repoName] = repo.split("/");

const octokit = github.getOctokit(githubToken);

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
const workflow = await octokit.rest.actions.getWorkflowRun({
  owner,
  repo: repoName,
  run_id: runNumber,
});
const workflowId = workflow.data.workflow_id;

// 获取 workflow run 列表
while (true) {
  const list = await octokit.rest.actions.listWorkflowRuns({
    owner,
    repo: repoName,
    workflow_id: workflowId,
  });
  const data = list.data.workflow_runs.filter((i) => {
    if (!["in_progress"].includes(i.status ?? "")) return false;
    const updatedAt = new Date(i.updated_at);
    if (updatedAt.getTime() >= Date.now()) return false;
    return true;
  });
  if (!data.length) break;
  delay(1000);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
