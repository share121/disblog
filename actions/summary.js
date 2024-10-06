"use strict";

const { env } = require("process");
const { spawn } = require("child_process");
const OpenAI = require("openai");

const {
  actionId,
  githubToken,
  discussionId,
  discussionTitle,
  discussionBody,
  owner,
} = env;

const client = new OpenAI({
  baseURL: "http://localhost:11434/v1/",
  apiKey: "ollama",
});

/** @param {string} data */
function graphql(data) {
  return fetch("https://api.github.com/graphql", {
    method: "POST",
    body: JSON.stringify({ query: data }),
    headers: { Authorization: `Bearer ${githubToken}` },
  }).then((res) => res.json());
}

/** @param {string} text */
function queryEncode(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

/** @param {string} body */
async function addComment(body) {
  await graphql(
    `
mutation {
  addDiscussionComment(input: { discussionId: "${discussionId}", body: "${queryEncode(
      body
    )}" }) {
    clientMutationId
  }
}`
  );
}

function genPrompt() {
  return `# ${discussionTitle}

${discussionBody.trim()}`;
}

async function ai(prompt) {
  const chatCompletion = await client.chat.completions.create({
    messages: [
      {
        role: "system",
        content: `你要总结帖子内容

## 要求

1. 多加点 emoji 表情
2. 分点总结

## 回答格式

### 总结

### 优化建议

`,
      },
      { role: "user", content: prompt },
    ],
    model: "qwen2.5:3b",
  });
  return chatCompletion.choices[0].message.content;
}

async function aiSummary() {
  const task = spawn("ollama", ["serve"]);
  const prompt = genPrompt();
  const reply = await ai(prompt);
  task.kill();
  addComment(
    `${reply}

> 来自：https://github.com/share121/disblog/actions/runs/${actionId}
> 如有异议，请在本条评论下方 @${owner}
> <details>
> <summary>Prompt 信息</summary>
>
> ${prompt.split("\n").join("\n> ")}
> </details>`
  );
}

aiSummary();
