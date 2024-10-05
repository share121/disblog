import axios from "axios";
import * as tf from "@tensorflow/tfjs-node";
import * as nsfw from "nsfwjs";

tf.enableProdMode();
const model = nsfw.load("./inception_v3/", { type: "graph" });

async function isNsfw(url) {
  const pic = await axios.get(url, { responseType: "arraybuffer" });
  const image = tf.node.decodeImage(pic.data, 3);
  const predictions = await (await model).classify(image);
  image.dispose();
  return ["Porn", "Hentai"].includes(predictions[0].className);
}

const f = isNsfw(
  "https://github.com/user-attachments/assets/d048b80e-8908-42d5-9c21-7f6d2f6a3088"
);
console.log(f);
