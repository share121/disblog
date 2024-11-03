export const option = {
  type: "function",
  function: {
    parameters: {
      type: "object",
      properties: {
        urls: {
          type: "string",
          description: "要访问的网页地址，多个地址用换行分隔",
        },
      },
      required: ["urls"],
    },
    name: "visit-website",
    description: "访问网页",
  },
};

export async function execute(args: { [key: string]: string }) {
  const urls = args.urls.split("\n");
  const p = urls.map(async (url) => {
    const r = await fetch(url);
    if (r.headers.get("content-type") === "text/html") {
      const text = await r.text();
      return text;
    }
  });
  const res = JSON.stringify(
    (await Promise.allSettled(p)).map((r, i) => ({ url: urls[i], ...r })),
  );
  console.log(res);
  return res;
}
