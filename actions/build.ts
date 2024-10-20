import { minify } from "npm:html-minifier";
import { copy } from "jsr:@std/fs";

const [owner, repoName] = Deno.env.get("repo")!.split("/");

(async () => {
  await Deno.mkdir("dist");
  await copy("src", "dist", { overwrite: true });
  const raw = (await Deno.readTextFile("src/index.html"))
    .replace('var owner = "share121";', `var owner = "${owner}";`)
    .replace('var repo = "disblog";', `var repo = "${repoName}";`);
  Deno.writeTextFile(
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
  );
})();
