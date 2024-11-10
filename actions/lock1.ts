import { Octokit } from "npm:octokit";

const octokit = new Octokit();

const f = await octokit.request("GET /repos/{owner}/{repo}/actions/workflows", {
  owner: "share121",
  repo: "disblog",
  headers: {
    "X-GitHub-Api-Version": "2022-11-28",
  },
});

console.log(f.data);
