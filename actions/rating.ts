import { createAi } from "./ai.ts";
import { addComment, addLabel, rmLabel } from "./api.ts";

const actionId = Deno.env.get("actionId")!,
  repo = Deno.env.get("repo")!,
  githubToken = Deno.env.get("githubToken")!,
  discussionId = Deno.env.get("discussionId")!,
  discussionBody = Deno.env.get("discussionBody")!,
  discussionTitle = Deno.env.get("discussionTitle")!,
  jobId = Deno.env.get("jobId")!,
  [owner, repoName] = repo.split("/");

const urlRegex = /https?:\/\/\S+/gi;

function genPrompt() {
  return `# ${discussionTitle}

${discussionBody.replace(urlRegex, "").trim()}`;
}

const prompt = genPrompt();
const ai = createAi({ contextSize: Infinity });
const msg = ai(prompt, {
  messages: [
    {
      role: "system",
      content:
        `你是 ${owner} 的 AI 助手，你要帮助 ${owner} 在他的 ${repoName} 论坛上审核帖子。

# 要求

1. 评价要明确，不能多选。
2. 先说结论，再分析原因。
3. 原因要分点说明，先说原文内容，后说具体原因。
4. 对于违规的帖子要指出违规的地方、原因和改进措施；对于优质的帖子要指出优点、并给予鼓励。
5. 论坛的风气比较开放，除非是明确违规的帖子，否则不要轻易打低分。
6. 少看缺点，多看优点。
7. 增加普通和高质的权重。

# 回答格式

## 评价

高质 or 普通 or 低质 or 风险 or 无法判断

## 原因

## 总结
`,
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

> 来自：https://github.com/share121/disblog/actions/runs/${actionId}/job/${jobId}
> 如有异议，请在本条评论下方 \`@${owner}\`
`,
    discussionId,
    githubToken,
  },
);
addLabel({ labelName: type, discussionId, githubToken, owner, repoName });
rmLabel({ labelName: "待审核", discussionId, githubToken, owner, repoName });
