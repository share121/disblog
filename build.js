import { env } from "process";
import { promises as fs } from "fs";
import { minify } from "html-minifier";
const [owner, repoName] = env.repo.split("/");

try {
  await fs.rm("dist", { recursive: true, force: true });
} catch {}
await fs.mkdir("dist");
await fs.cp("src", "dist", {
  recursive: true,
  filter: (file) => file !== "src/index.html",
});
const raw = (await fs.readFile("src/index.html", "utf-8")).replace(
  "<script>",
  `<script>var owner = "${owner}", repo = "${repoName}";`
);
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