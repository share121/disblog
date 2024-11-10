import { Octokit } from "npm:octokit";

const runNumber = +Deno.env.get("runNumber")!,
  repo = Deno.env.get("repo")!,
  [owner, repoName] = repo.split("/"),
  workflowName = Deno.env.get("workflowName")!;

const octokit = new Octokit();

const f = await octokit.request(
  "GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs",
  {
    owner: "share121",
    repo: "disblog",
    workflow_id: workflowName,
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
    },
  },
);

console.log(f.data);

for (const i of f.data.workflow_runs) {
  if (!["in_progress"].includes(i.status ?? "")) continue;
  const updatedAt = new Date(i.updated_at);
  if (updatedAt.getTime() >= Date.now()) continue;
  octokit.hook("workflow_job", (e) => {
    console.log(e);
  }, {});
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
