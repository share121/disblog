const { Client } = require("discord.js");
const { env } = require("process");
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
    discordToken,
    discussionNumber: discussionNumberStr,
    channelId,
    targetUserId,
  } = env,
  [owner, repoName] = repo.split("/"),
  client = new Client({
    intents: ["Guilds", "GuildMessages", "MessageContent"],
  }),
  discussionNumber = Number(discussionNumberStr);

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
  const pic = await sharp(
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
  )
    .png()
    .toBuffer();
  const image = tf.node.decodeImage(new Uint8Array(pic), 3);
  const predictions = await (await model).classify(image);
  image.dispose();
  console.log({ url, predictions });
  return [["Porn", "Hentai"].includes(predictions[0].className), predictions];
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

function formatBody() {
  const m = discussionBody.match(urlRegex);
  if (m === null) return discussionBody.replace(/\s+/g, " ");
  return (
    discussionBody
      .replace(/!\[.*?]\(.*?\)/g, "")
      .replace(/\[.*?]\(.*?\)/g, "")
      .replace(urlRegex, "")
      .replace(/\s+/g, " ")
      .trim() + `\n文章中的链接:\n${m.join("\n")}`
  );
}

function genPrompt() {
  const m = discussionBody.match(urlRegex);
  if (m === null) {
    return `讨论 ID: ${discussionNumber}
标题: ${discussionTitle}
论坛内容: ${discussionBody.replace(/\s+/g, " ").trim()}
[评论内容: 好 or 普通 or 差 or 无法判断]
[要求: 解读论坛内容，并给出评论内容，先说结论，再说原因]
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
[要求: 解读文章中的链接和论坛内容，并给出评论内容，先说结论，再说原因]
[回答格式: <好|普通|差|无法判断><换行><原因>]`;
}

async function aiRating() {
  const channel = client.channels.cache.get(channelId),
    msg = genPrompt();
  console.log("Sent message to channel");
  await channel.send(msg);
  console.log("Waiting for reply...");
  const replyList = await channel.awaitMessages({
    filter: (m) => m.author.id === targetUserId && m.channelId === channelId,
    max: 1,
    time: 60_000,
  });
  const reply = replyList.first().content;
  await channel.send(`收到回复：${reply}`);
  let type = undefined;
  if (reply.includes("无法判断")) {
    type = "无法判断";
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

> [!TIP]
> 来自：https://github.com/share121/disblog/actions/runs/${actionId}
> 如有异议，请在本条评论下方 @${owner}
> <details><summary>Prompt 信息</summary>${msg}</details>`
  );
  if (type !== undefined) {
    addLabel(type);
    rmLabel("待审核");
  }
  await client.destroy();
}

async function checkContentIsNsfw() {
  const m = discussionBody.match(urlRegex);
  if (m === null) return;
  const nsfwUrls = [];
  for (const url of m) {
    try {
      const [nsfw, predictions] = await checkNsfw(url);
      if (nsfw) {
        if (nsfwUrls.length === 0) addLabel("NSFW");
        nsfwUrls.push({ i: url, predictions });
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
      `${i + 1}. ${url}\n  ${predictions}\n  ![${url}](${url})\n`
  )
  .join()}

> [!TIP]
> 来自：https://github.com/share121/disblog/actions/runs/${actionId}
> 如有异议，请在本条评论下方 @${owner}`
    );
  }
}

clearLabel();
addLabel("待审核");
checkContentIsNsfw();
client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  try {
    await aiRating();
  } catch (err) {
    console.error(err);
  }
});
client.login(discordToken);
