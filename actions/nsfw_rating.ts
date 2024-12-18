import tf from "@tensorflow/tfjs-node";
import * as nsfw from "nsfwjs";
import path from "node:path";
import sharp from "sharp";
import { addComment, addLabel } from "./api.ts";
import markdownit from "markdown-it";
import * as cheerio from "cheerio";

const actionId = Deno.env.get("actionId")!,
  repo = Deno.env.get("repo")!,
  githubToken = Deno.env.get("githubToken")!,
  discussionId = Deno.env.get("discussionId")!,
  discussionBody = Deno.env.get("discussionBody")!,
  [owner, repoName] = repo.split("/");

const md = markdownit({
  html: true,
  xhtmlOut: true,
  breaks: true,
  linkify: true,
  typographer: true,
});
const html: string = md.render(discussionBody);
const $ = cheerio.load(html);

tf.enableProdMode();

const model = nsfw.load(
  new URL(
    "file:" + path.resolve("mobilenet_v2") + path.sep,
  ).toString(),
);
async function checkNsfw(url: string) {
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
    ).arrayBuffer(),
  );
  const image = tf.node.decodeImage(
    new Uint8Array(await pic.jpeg().toBuffer()),
    3,
  );
  const predictions = await (await model).classify(image);
  image.dispose();
  return [
    ["Porn", "Hentai"].includes(predictions[0].className) ||
    predictions.some(
      (e) => ["Porn", "Hentai"].includes(e.className) && e.probability > 0.4,
    ),
    predictions,
  ];
}
function formatPredictions(predictions: nsfw.PredictionType[]) {
  return predictions
    .map((p) => `${p.className}: ${p.probability}`)
    .join("\n  ");
}

const m = [
  ...$("a[href]").toArray().map((e) => $(e).prop("href")),
  ...$("img[src]").toArray().map((e) => $(e).prop("src")),
].filter((e) => e !== undefined);
if (!m.length) Deno.exit(0);
const nsfwUrls = [];
for (const url of m) {
  try {
    const [nsfw, predictions] = await checkNsfw(url);
    if (!nsfw) continue;
    if (nsfwUrls.length === 0) {
      addLabel({
        discussionId,
        labelName: "NSFW",
        githubToken,
        owner,
        repoName,
      });
    }
    nsfwUrls.push({ url, predictions });
  } catch (e) {
    console.error(e);
  }
}
if (nsfwUrls.length === 0) Deno.exit(0);
addComment(
  {
    body: `发现 NSFW 内容，请尽快整改

${
      nsfwUrls
        .map(
          ({ url, predictions }, i) =>
            `${i + 1}. \`${url}\`\n  ${
              formatPredictions(
                predictions as nsfw.PredictionType[],
              )
            }\n`,
        )
        .join("")
    }

> 来自：https://github.com/${owner}/${repoName}/actions/runs/${actionId}/
> 如有异议，请在本条评论下方 \`@${owner}\`
`,
    discussionId,
    githubToken,
  },
);
