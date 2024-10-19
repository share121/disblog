import { addLabel, clearLabel } from "./api.ts";

const githubToken = Deno.env.get("githubToken")!,
  discussionId = Deno.env.get("discussionId")!,
  repo = Deno.env.get("repo")!,
  [owner, repoName] = repo.split("/");

clearLabel({ discussionId, githubToken });
addLabel({
  discussionId,
  githubToken,
  labelName: "待审核",
  repoName,
  owner,
});
