import { createAi } from "./ai.ts";
import { addComment, addLabel, rmLabel } from "./api.ts";

const actionId = Deno.env.get("actionId")!,
  repo = Deno.env.get("repo")!,
  githubToken = Deno.env.get("githubToken")!,
  discussionId = Deno.env.get("discussionId")!,
  discussionBody = Deno.env.get("discussionBody")!,
  discussionTitle = Deno.env.get("discussionTitle")!,
  [owner, repoName] = repo.split("/");

function genPrompt() {
  return `# 论坛标题

\`\`\`
${discussionTitle}
\`\`\`

# 论坛内容

\`\`\`md
${discussionBody.trim()}
\`\`\`
`;
}

const prompt = genPrompt();
const ai = createAi({ contextSize: Infinity });
const msg = ai(prompt, {
  messages: [
    {
      role: "system",
      content:
        `你是 ${owner} 的 AI 助手，你要帮助 ${owner} 在他的 ${repoName} 论坛上审核帖子
要求：评价要明确，只能选一个。使用“访问网页”功能，访问文中的url，并一起审核
回答格式：
## 评价
高质 or 普通 or 低质 or 风险 or 无法判断
## 原因
## 总结`,
    },
  ],
  model: "qwen2.5:7b",
});
let reply = "";
for await (const i of msg) {
  reply += i;
  Deno.stdout.write(new TextEncoder().encode(i));
}
const type = [
  { type: "无法判断", pos: reply.indexOf("无法判断") },
  { type: "风险", pos: reply.indexOf("风险") },
  { type: "低质", pos: reply.indexOf("低质") },
  { type: "普通", pos: reply.indexOf("普通") },
  { type: "高质", pos: reply.indexOf("高质") },
]
  .filter((e) => e.pos !== -1)
  .sort((a, b) => a.pos - b.pos)[0]?.type ?? "无法判断";
addComment(
  {
    body: `${reply}

> 来自：https://github.com/${owner}/${repoName}/actions/runs/${actionId}/
> 如有异议，请在本条评论下方 \`@${owner}\`
`,
    discussionId,
    githubToken,
  },
);
addLabel({ labelName: type, discussionId, githubToken, owner, repoName });
rmLabel({ labelName: "待审核", discussionId, githubToken, owner, repoName });
