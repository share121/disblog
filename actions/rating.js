"use strict";

const { env } = require("process");
const { spawn } = require("child_process");
const OpenAI = require("openai");

const {
    actionId,
    repo,
    githubToken,
    discussionId,
    discussionTitle,
    discussionBody,
  } = env,
  [owner, repoName] = repo.split("/");

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

/** @param {string} labelName @returns {Promise<string>} */
async function getLabelId(labelName) {
  const res = await graphql(
    `
{
  repository(owner: "${owner}", name: "${repoName}") {
    label(name: "${labelName}") {
      id
    }
  }
}`
  );
  return res.data.repository.label.id;
}

/** @param {string} labelName */
async function addLabel(labelName) {
  const labelId = await getLabelId(labelName);
  await graphql(
    `
mutation {
  addLabelsToLabelable(
    input: {labelableId: "${discussionId}", labelIds: ["${labelId}"]}
  ) {
    clientMutationId
  }
}`
  );
}

/** @param {string} labelName */
async function rmLabel(labelName) {
  const labelId = await getLabelId(labelName);
  await graphql(
    `
mutation {
  removeLabelsFromLabelable(
    input: {labelableId: "${discussionId}", labelIds: ["${labelId}"]}
  ) {
    clientMutationId
  }
}`
  );
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
        content: `你要扮演论坛审核员。

## 要求

1. 评价要明确，不能多选。
2. 先说结论，再分析原因。
3. 原因要分点说明，先说原文内容，后说具体原因。
4. 对于违规的帖子要指出违规的地方、原因和改进措施；对于优质的帖子要指出优点、并给予鼓励。
5. 论坛的风气比较开放，除非是明确违规的帖子，否则不要轻易打低分。
6. 如果帖子内容是正常的，但是有其他问题，比如标题党、刷屏、刷赞、刷评论等，也要指出，并给出改进措施。


## 回答格式

### 评价

高质 or 普通 or 低质 or 风险 or 无法判断

### 原因

### 总结

`,
      },
      { role: "user", content: prompt },
    ],
    model: "qwen2.5:3b",
  });
  return chatCompletion.choices[0].message.content;
}

async function aiRating() {
  const task = spawn("ollama", ["serve"]);
  const prompt = genPrompt();
  const reply = await ai(prompt);
  task.kill();
  const type =
    [
      { type: "无法判断", pos: reply.indexOf("无法判断") },
      { type: "风险", pos: reply.indexOf("风险") },
      { type: "低质", pos: reply.indexOf("低质") },
      { type: "普通", pos: reply.indexOf("普通") },
      { type: "高质", pos: reply.indexOf("高质") },
    ]
      .filter((e) => e.pos !== -1)
      .sort((a, b) => a.pos - b.pos)[0]["type"] ?? "无法判断";
  addComment(
    `${reply}

> 来自：https://github.com/share121/disblog/actions/runs/${actionId}
> 如有异议，请在本条评论下方 @${owner}
`
  );
  addLabel(type);
  rmLabel("待审核");
}

aiRating();
