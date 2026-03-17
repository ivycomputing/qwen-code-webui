import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.text("Hello World"));

const server = serve({
  fetch: app.fetch,
  port: 8080,
  hostname: "127.0.0.1",
});

console.log("Server instance:", server);
console.log("Listening on http://127.0.0.1:8080");

// Keep the server instance alive
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _server = server;

// Keep process alive with setInterval
const interval = setInterval(() => {
  console.log("Keep alive");
}, 10000);

// Clear interval when server closes
server.on("close", () => {
  clearInterval(interval);
});
