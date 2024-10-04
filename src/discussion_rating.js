/* eslint-disable no-await-in-loop */
/* eslint-disable func-style */
/* eslint-disable no-console */
import { Client } from "discord.js";
import process from "process";

const {
    repo,
    githubToken,
    discussionId,
    discussionTitle,
    discussionBody,
    discordToken,
    discussionNumberStr,
    channelIdStr,
    targetUserIdStr,
    delayTimeStr,
  } = process.env,
  [owner, repoName] = repo.split("/"),
  channelId = Number(channelIdStr),
  client = new Client(),
  delayTime = Number(delayTimeStr),
  discussionNumber = Number(discussionNumberStr),
  targetUserId = Number(targetUserIdStr);

/** @param {number} ms */
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** @param {string} data */
function graphql(data) {
  return fetch("https://api.github.com/graphql", {
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
  console.log(`Adding label ${labelName} to discussion ${discussionNumber}`);
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

function genPrompt() {
  return `讨论 ID：${discussionNumber}
标题：${discussionTitle}
论坛内容：${discussionBody}
［评论内容：好 or 普通 or 差 or 无法判断］`;
}

// eslint-disable-next-line max-statements
async function aiRating() {
  const channel = client.channels.cache.get(channelId),
    msg = genPrompt();
  while (true) {
    console.log("Sent message to channel");
    await channel.send(msg);
    console.log("Waiting for reply...");
    const reply = await channel.awaitMessages(
      (replyMsg) =>
        replyMsg.author.id === targetUserId &&
        replyMsg.channel.id === channelId,
      { timeout: 200 }
    );
    await channel.send(`收到回复：${reply.content}`);
    if (reply.content.includes("无法判断")) {
      addLabel("低质");
    } else if (reply.content.includes("普通")) {
      addLabel("普通");
    } else if (reply.content.includes("好")) {
      addLabel("高质");
    } else if (reply.content.includes("差")) {
      addLabel("风险");
    } else if (reply.content.includes("等待")) {
      await delay(delayTime);
      // eslint-disable-next-line no-continue
      continue;
    }
    await client.close();
  }
}

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
