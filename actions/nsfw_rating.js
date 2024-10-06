"use strict";

const { env } = require("process");
const tf = require("@tensorflow/tfjs-node");
const nsfw = require("nsfwjs");
const path = require("path");
const sharp = require("sharp");

const { actionId, repo, githubToken, discussionId, discussionBody } = env,
  [owner, repoName] = repo.split("/");

const urlRegex =
  /(https?|ftp|file):\/\/[-A-Za-z0-9+&@#/%?=~_|!:,.;]+[-A-Za-z0-9+&@#/%=~_|]/gi;

tf.enableProdMode();

const model = nsfw.load(
  new URL(
    "file:" + path.resolve(__dirname, "../mobilenet_v2") + path.sep
  ).toString()
);
async function checkNsfw(url) {
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

checkContentIsNsfw();
