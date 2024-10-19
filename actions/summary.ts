import { createAi } from "./ai.ts";
import { addComment } from "./api.ts";

const actionId = Deno.env.get("actionId")!,
  owner = Deno.env.get("owner")!,
  githubToken = Deno.env.get("githubToken")!,
  discussionId = Deno.env.get("discussionId")!,
  discussionBody = Deno.env.get("discussionBody")!,
  discussionTitle = Deno.env.get("discussionTitle")!,
  jobId = Deno.env.get("jobId")!;

function genPrompt() {
  return `# ${discussionTitle}

${discussionBody.trim()}`;
}

const prompt = genPrompt();
const ai = createAi({ contextSize: Infinity });
const msg = ai(prompt, {
  messages: [
    {
      role: "system",
      content: `你是 ${owner} 的 AI 助手，你要帮助 ${owner} 总结帖子内容。

# 要求

1. 多加点 emoji 表情
2. 分点总结

# 回答格式

## 总结

## 优化建议
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
