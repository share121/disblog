import * as cheerio from "npm:cheerio";

// const runNumber = +Deno.env.get("runNumber")!,
//   githubToken = Deno.env.get("githubToken")!,
//   repo = Deno.env.get("repo")!,
//   [owner, repoName] = repo.split("/");

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

const r = await fetch(
  "https://github.com/share121/disblog/actions/workflows/save-discussion.yaml?page=2",
);
const html = await r.text();
Deno.writeTextFile("html.html", html);
const $ = await cheerio.load(html);
const t = $(
  "div > div.d-table-cell.v-align-top.col-11.col-md-6.position-relative > span",
)
  .toArray().map((e) => $(e).prop("innerText")?.replace(/\s+/, " "));
console.log(t);
