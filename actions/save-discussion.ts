const event = Deno.env.get("event")!;
console.log(JSON.parse(event));
