import { createServer } from "node:http";

import { createApp } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { getPrismaClient } from "./db.mjs";

const config = loadConfig();
const prisma = getPrismaClient();
const app = createApp({ prisma, config });
const server = createServer(app);

server.listen(config.port, () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  console.log(`TF20 runtime foundation listening on port ${port}`);
});

const shutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down.`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
