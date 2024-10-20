import { minify } from "npm:html-minifier";
import { copy } from "jsr:@std/fs";
import { escape } from "jsr:@std/html";
import path from "node:path";
import GithubEvent from "./github-event.json" with { type: "json" };

// const [owner, repoName] = Deno.env.get("repo")!.split("/");
const [owner, repoName] = ["share121", "disblog"];

await Deno.mkdir("dist").catch(async () => {
  await Deno.remove("dist", { recursive: true });
  await Deno.mkdir("dist");
});
await copy("src", "dist", { overwrite: true });
let raw = (await Deno.readTextFile("src/index.html"))
  .replace('var owner = "share121";', `var owner = "${owner}";`)
  .replace('var repo = "disblog";', `var repo = "${repoName}";`);

const discussionsFolder = "discussions";
let cards = "";
for await (const files of Deno.readDir(discussionsFolder)) {
  if (!files.name.endsWith(".json")) continue;
  const event: typeof GithubEvent = JSON.parse(
    await Deno.readTextFile(path.join(discussionsFolder, files.name)),
  );
  const cover = event.discussion.body.match(/!\[.*?\]\((.*?)\)/)?.[1] ??
    "cover.svg";
  const card = createDiscussionCard({
    title: event.discussion.title,
    content: event.discussion.body,
    avatar: event.discussion.user.avatar_url,
    name: event.discussion.user.login,
    commentCount: event.discussion.comments,
    cover,
  });
  cards += card;
}
raw = raw.replace("<!-- discussions -->", cards);

Deno.writeTextFile(
  "dist/index.html",
  minify(raw, {
    collapseBooleanAttributes: true,
    collapseInlineTagWhitespace: true,
    collapseWhitespace: true,
    keepClosingSlash: true,
    minifyCSS: true,
    minifyJS: true,
    removeComments: true,
    removeOptionalTags: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    sortAttributes: true,
    sortClassName: true,
    useShortDoctype: true,
  }),
);

function createDiscussionCard(
  { cover, commentCount, avatar, name, title, content }: {
    cover: string;
    commentCount: number;
    avatar: string;
    name: string;
    title: string;
    content: string;
  },
) {
  return /* html */ `
<button class="discussion-card" type="button">
  <div class="cover-box">
    <img class="cover" src="${
    encodeURI(cover)
  }" onabort="this.src = 'cover.svg'" onerror="this.src = 'cover.svg'" onload="waterfall(cardgrid)" alt="封面" loading="lazy" />
    <div class="comment-count">${escape(commentCount + "")}</div>
  </div>
  <div class="author-box">
    <img class="avatar" src="${
    encodeURI(avatar)
  }" onabort="this.src = 'avatar.svg'" onerror="this.src = 'avatar.svg'" alt="头像" loading="lazy" />
    <div class="name">${escape(name)}</div>
  </div>
  <h3 class="title">${escape(title)}</h3>
  <div class="content">${escape(content)}</div>
</button>
`;
}
