"use strict";

const { env } = require("process");
const { promises: fs } = require("fs");
const { minify } = require("html-minifier");
const [owner, repoName] = env.repo.split("/");

(async () => {
  try {
    await fs.rm("dist", { force: true, recursive: true });
  } catch {}
  await fs.mkdir("dist");
  await fs.cp("src", "dist", {
    filter: (file) => file !== "src/index.html",
    recursive: true,
  });
  const raw = (await fs.readFile("src/index.html", "utf-8"))
    .replace('var owner = "share121";', `var owner = "${owner}";`)
    .replace('var repo = "disblog";', `var repo = "${repoName}";`);
  fs.writeFile(
    "dist/index.html",
    minify(raw, {
      collapseBooleanAttributes: true,
      collapseInlineTagWhitespace: true,
      collapseWhitespace: true,
      keepClosingSlash: true,
      minifyCSS: true,
      minifyJS: true,
      removeComments: true,
      removeOptionalTags: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      sortAttributes: true,
      sortClassName: true,
      useShortDoctype: true,
    }),
    "utf-8"
  );
})();
