import { Octokit } from "npm:octokit";

const repo = Deno.env.get("repo")!,
  [owner, repoName] = repo.split("/"),
  workflowName = Deno.env.get("workflowName")!;

const octokit = new Octokit();

const workflowId = await getWorkflowId(owner, repoName, workflowName) as number;
const allRuns = await getWorkflowRuns(owner, repoName, workflowId);
const afterRuns = allRuns.data.workflow_runs.filter((e) => {
  if (!["in_progress"].includes(e.status ?? "")) return false;
  const updatedAt = new Date(e.updated_at);
  if (updatedAt.getTime() >= Date.now()) return false;
  return true;
});

if (!afterRuns.length) {
  console.log("No runs to lock");
  Deno.exit(0);
}
for (const run of afterRuns) {
  octokit.hook("workflow_run", (e) => {
    console.log(e);
  }, {
    action: "completed",
    repository: repo,
    workflow: null,
    workflow_run: run,
  });
}

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

async function getWorkflowRuns(
  owner: string,
  repo: string,
  workflowId: number | string,
) {
  return await octokit.request(
    "GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs",
    {
      owner: owner,
      repo: repo,
      workflow_id: workflowId,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
}

async function getWorkflowId(
  owner: string,
  repo: string,
  workflowName: string,
) {
  const workflows = await octokit.request(
    "GET /repos/{owner}/{repo}/actions/workflows",
    {
      owner: owner,
      repo: repo,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  return workflows.data.workflows.find((e) => e.name === workflowName)?.id;
}
