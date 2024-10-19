import ollama, { ChatRequest, Message, Tool } from "npm:ollama";
import path from "node:path";
import { Mutex } from "npm:async-mutex";

const constraints = "\n\n约束：不包含借口或上下文，只返回答案。";
new Deno.Command("ollama", { args: ["serve"] }).spawn();

const tools: {
  option: Tool;
  execute: (arg: { [key: string]: string }) => Promise<string> | string;
}[] = [];

const foldersPath = path.join(Deno.cwd(), "ai-tools");
const aiToolsFolders = Deno.readDir(foldersPath);

for await (const folder of aiToolsFolders) {
  const toolsPath = path.join(foldersPath, folder.name);
  const toolFiles = Deno.readDir(toolsPath);
  for await (const file of toolFiles) {
    if (!file.name.endsWith(".ts")) continue;
    const filePath = path.join(toolsPath, file.name);
    const tool = await import(filePath);
    if ("option" in tool && "execute" in tool) {
      tools.push(tool);
    } else {
      console.warn(
        `[警告] 位于 ${filePath} 的命令缺少必需的 \`option\` 或 \`execute\` 属性`,
      );
    }
  }
}

export function createAi({ contextSize }: { contextSize: number }) {
  let messages: Message[] = [];
  const mutex = new Mutex();

  async function* ai(prompt: string, options: ChatRequest) {
    // 清理历史记录
    const len = messages.length - contextSize;
    if (len > 0) messages = messages.slice(len);

    // 生成 prompt
    const msg = prompt + constraints;
    messages.push({ role: "user", content: msg });

    // 请求
    const response = await ollama.chat({
      ...options,
      messages: [...(options.messages ?? []), ...messages],
      tools: tools.map((t) => t.option),
      stream: false,
    });
    messages.push(response.message);

    // 检测是否使用工具
    if (!response.message.tool_calls || !response.message.tool_calls.length) {
      console.log("模型未使用工具");
      yield response.message.content;
      return;
    }

    // 使用工具
    console.log(
      `模型使用工具: ${
        response.message.tool_calls
          .map((t) => t.function.name)
          .join(", ")
      }`,
    );
    const promises: Promise<string>[] = [];
    for (const tool of response.message.tool_calls) {
      const fn = tools.find(
        (t) => t.option.function.name === tool.function.name,
      )?.execute;
      if (!fn) {
        console.warn(`未找到工具 ${tool.function.name} 的执行函数`);
        continue;
      }
      promises.push(Promise.resolve(fn(tool.function.arguments)));
    }
    for (const result of await Promise.all(promises)) {
      messages.push({
        role: "tool",
        content: result,
      });
    }

    const finalResponse = await ollama.chat({
      ...options,
      messages: [...(options.messages ?? []), ...messages],
      stream: true,
    });
    let content = "";
    let temp = "";
    for await (const chunk of finalResponse) {
      const t = chunk.message.content;
      if (t) {
        temp += t;
        if (t.trim()) {
          content += temp;
          yield temp;
          temp = "";
        }
      }
    }
    messages.push({ role: "assistant", content });
  }

  return async function* (prompt: string, options: ChatRequest) {
    const release = await mutex.acquire();
    try {
      yield* ai(prompt, options);
    } finally {
      release();
    }
  };
}
