import { Client } from "discord.js";
import process from "process";

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
  } = process.env,
  [owner, repoName] = repo.split("/"),
  client = new Client({
    intents: ["Guilds", "GuildMessages", "MessageContent"],
  }),
  discussionNumber = Number(discussionNumberStr);

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
  if (labelName != "待审核") rmLabel("待审核");
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

function genPrompt() {
  return `讨论 ID：${discussionNumber}
标题：${discussionTitle}
论坛内容：${discussionBody}
［评论内容：好 or 普通 or 坏 or 无法判断］`;
}

async function aiRating() {
  const channel = client.channels.cache.get(channelId),
    msg = genPrompt();
  console.log("Sent message to channel");
  await channel.send(msg);
  console.log("Waiting for reply...");
  const replyList = await channel.awaitMessages({
    filter: (replyMsg) =>
      replyMsg.author.id === targetUserId && replyMsg.channelId === channelId,
    max: 1,
    time: 30_000,
  });
  const reply = replyList.first().content;
  await channel.send(`收到回复：${reply}`);
  if (reply.includes("无法判断")) {
    addLabel("低质");
  } else if (reply.includes("坏")) {
    addLabel("风险");
  } else if (reply.includes("普通")) {
    addLabel("普通");
  } else if (reply.includes("好")) {
    addLabel("高质");
  }
  await client.destroy();
}

addLabel("待审核");
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
