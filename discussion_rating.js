const Client = require("discord.js").Client;
const env = require("process").env;
const tf = require("@tensorflow/tfjs-node");
const nsfw = require("nsfwjs");
const path = require("path");
const sharp = require("sharp");

const {
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
    "file:" + path.resolve(__dirname, "inception_v3") + path.sep
  ).toString(),
  { type: "graph" }
);

async function isNsfw(url) {
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
  return ["Porn", "Hentai"].includes(predictions[0].className);
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
  return `讨论 ID：${discussionNumber}
标题：${discussionTitle}
论坛内容：${discussionBody
    .replace(/\!\[.*?]\(.*?\)/g, "")
    .replace(/\[.*?]\(.*?\)/g, "")
    .replace(urlRegex, "")
    .replace(/\s+/g, " ")}
［评论内容：好 or 普通 or 差 or 无法判断］`;
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
  if (reply.includes("风险")) {
    type = "风险";
  } else if (reply.includes("无法判断") || reply.includes("差")) {
    type = "低质";
  } else if (reply.includes("普通")) {
    type = "普通";
  } else if (reply.includes("好")) {
    type = "高质";
  }
  if (type !== undefined) {
    addLabel(type);
    rmLabel("待审核");
  }
  await client.destroy();
}

async function checkContentIsNsfw() {
  let promises = discussionBody.match(urlRegex).map((i) => isNsfw(i));
  const res = await Promise.allSettled(promises);
  res
    .filter((e) => e.status === "rejected")
    .forEach((e) => console.log(e.reason));
  const isNsfwRes = res.some((e) => e.value === true);
  if (isNsfwRes) addLabel("NSFW");
}

clearLabel();
addLabel("待审核");
checkContentIsNsfw();
client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  while (true) {
    try {
      await aiRating();
      break;
    } catch (err) {
      console.error(err);
    }
  }
});
client.login(discordToken);
