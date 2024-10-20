import Event from "./event.json" with { type: "json" };
const event: typeof Event = JSON.parse(Deno.env.get("event")!);
Deno.writeTextFile(
  `discussions/${event.discussion.number}-${Date.now()}.json`,
  JSON.stringify(event),
);
