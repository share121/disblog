const { env } = require("process");
const { spawn } = require("child_process");
const tf = require("@tensorflow/tfjs-node");
const nsfw = require("nsfwjs");
const path = require("path");
const sharp = require("sharp");

const {
    actionId,
    repo,
    githubToken,
    discussionId,
    discussionTitle,
    discussionBody,
    discussionNumber: discussionNumberStr,
  } = env,
  [owner, repoName] = repo.split("/"),
  discussionNumber = Number(discussionNumberStr);

const OpenAI = require("openai");

const client = new OpenAI({
  baseURL: "http://localhost:11434/v1/",
  apiKey: "ollama",
});

const urlRegex =
  /(https?|ftp|file):\/\/[-A-Za-z0-9+&@#/%?=~_|!:,.;]+[-A-Za-z0-9+&@#/%=~_|]/gi;

tf.enableProdMode();

const model = nsfw.load(
  new URL(
    "file:" + path.resolve(__dirname, "mobilenet_v2") + path.sep
  ).toString()
);
async function checkNsfw(url) {
  console.log(`Check url ${url}`);
  const pic = sharp(
    await (
      await fetch(url, {
        headers: {
          Origin: new URL(url).origin,
          Referer: url,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
        },
      })
    ).arrayBuffer()
  );
  const image = tf.node.decodeImage(
    new Uint8Array(await pic.jpeg().toBuffer()),
    3
  );
  const predictions = await (await model).classify(image);
  image.dispose();
  return [
    ["Porn", "Hentai"].includes(predictions[0].className) ||
      predictions.some(
        (e) => ["Porn", "Hentai"].includes(e.className) && e.probability > 0.4
      ),
    predictions,
  ];
}

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
  console.log(`Getting label ID for ${labelName}`);
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
  console.log(
    `Adding label ${labelName}: ${labelId} to discussion ${discussionNumber}: ${discussionId}`
  );
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
  console.log(
    `Adding comment to discussion ${discussionNumber}: ${discussionId}`
  );
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

/** @param {string} labelName */
async function rmLabel(labelName) {
  const labelId = await getLabelId(labelName);
  console.log(
    `Removing label ${labelName}: ${labelId} on discussion ${discussionNumber}: ${discussionId}`
  );
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

async function clearLabel() {
  console.log(
    `Removing All labels on discussion ${discussionNumber}: ${discussionId}`
  );
  await graphql(
    `
mutation {
  clearLabelsFromLabelable(input: {labelableId: "${discussionId}"}) {
    clientMutationId
  }
}`
  );
}

function genPrompt() {
  const m = discussionBody.match(urlRegex);
  if (m === null) {
    return `讨论 ID: ${discussionNumber}
标题: ${discussionTitle}
论坛内容: ${discussionBody.replace(/\s+/g, " ").trim()}
[评论内容: 好 or 普通 or 差 or 无法判断]
[回答格式: <好|普通|差|无法判断><换行><原因>]`;
  }
  const body = discussionBody
    .replace(/!\[.*?]\(.*?\)/g, "")
    .replace(/\[.*?]\(.*?\)/g, "")
    .replace(urlRegex, "")
    .replace(/\s+/g, " ")
    .trim();
  return `讨论 ID: ${discussionNumber}
标题: ${discussionTitle}
论坛内容: ${body}
文章中的链接:
${m.join("\n")}
[评论内容: 好 or 普通 or 差 or 无法判断]
[回答格式: <好|普通|差|无法判断><换行><原因>]`;
}

async function ai(prompt) {
  const chatCompletion = await client.chat.completions.create({
    messages: [
      {
        role: "system",
        content: `你要扮演论坛审核员，一切违反中华人民共和国法律和道德的帖子都不能让它过审。

## 要求

1. 先说结论，再分析原因
2. 分点说明哪些地方违法了哪些法律，哪些地方可能会有风险

## 回答格式

### 评价

好|普通|差|无法判断

### 原因

1. **原文内容**：违规原因
2. **原文内容**：违规原因
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
  const msg = genPrompt();
  const reply = await ai(msg);
  task.kill();
  let type = "无法判断";
  if (reply.includes("无法判断")) {
  } else if (reply.includes("风险")) {
    type = "风险";
  } else if (reply.includes("差")) {
    type = "低质";
  } else if (reply.includes("普通")) {
    type = "普通";
  } else if (reply.includes("好")) {
    type = "高质";
  }
  addComment(
    `${reply}

> 来自：https://github.com/share121/disblog/actions/runs/${actionId}
> 如有异议，请在本条评论下方 @${owner}
> <details>
> <summary>Prompt 信息</summary>
>
> ${msg.split("\n").join("\n> ")}
> </details>`
  );
  addLabel(type);
  rmLabel("待审核");
}

async function checkContentIsNsfw() {
  function formatPredictions(predictions) {
    return predictions
      .map((p) => `${p.className}: ${p.probability}`)
      .join("\n  ");
  }

  const m = discussionBody.match(urlRegex);
  if (m === null) return;
  const nsfwUrls = [];
  for (const url of m) {
    try {
      const [nsfw, predictions] = await checkNsfw(url);
      if (nsfw) {
        if (nsfwUrls.length === 0) addLabel("NSFW");
        nsfwUrls.push({ url, predictions });
      }
    } catch (e) {
      console.error(e);
    }
  }
  if (nsfwUrls.length > 0) {
    addComment(
      `发现 NSFW 内容，请尽快整改

${nsfwUrls
  .map(
    ({ url, predictions }, i) =>
      `${i + 1}. ${url}\n  ${formatPredictions(
        predictions
      )}\n  ![${url}](${url})\n`
  )
  .join()}

> 来自：https://github.com/share121/disblog/actions/runs/${actionId}
> 如有异议，请在本条评论下方 @${owner}`
    );
  }
}

clearLabel();
addLabel("待审核");
checkContentIsNsfw();
aiRating();
