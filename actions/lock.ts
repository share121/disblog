import { Octokit } from "npm:octokit";

const runId = +Deno.env.get("runId")!,
  repo = Deno.env.get("repo")!,
  [owner, repoName] = repo.split("/"),
  workflowName = Deno.env.get("workflowName")!;

const octokit = new Octokit();

const workflowId = await getWorkflowId(owner, repoName, workflowName) as number;
const allRuns = await getWorkflowRuns(owner, repoName, workflowId);
const beforeRuns = allRuns.data.workflow_runs.filter((e) => {
  return isBefore() && isRunning();

  function isRunning() {
    if (!e.status) return false;
    return ["in_progress", "queued"].includes(e.status);
  }
  function isBefore() {
    return e.id < runId;
  }
});

if (!beforeRuns.length) {
  console.log("No runs to lock");
  Deno.exit(0);
}
console.log("Waiting for runs: ", beforeRuns.map((e) => e.id));
await waitBeforeRuns(repo, beforeRuns);

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

function waitBeforeRuns(repo: string, task: typeof beforeRuns) {
  return new Promise<void>((resolve) => {
    let count = 0;
    for (const run of task) {
      octokit.hook("workflow_run", () => {
        count++;
        console.log(count, ":", run, "finished");
        if (count === task.length) {
          resolve();
        }
      }, {
        action: "completed",
        repository: repo,
        workflow: null,
        workflow_run: run,
      });
    }
  });
}
