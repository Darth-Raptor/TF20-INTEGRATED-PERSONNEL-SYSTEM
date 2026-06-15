import { createServer } from "node:http";

import { createApp } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { getPrismaClient } from "./db.mjs";
import { startDiscordDeliveryDispatcher } from "./discord-delivery-service.mjs";

const config = loadConfig();
const prisma = getPrismaClient();
let shuttingDown = false;
const app = createApp({
  prisma,
  config,
  requestShutdown: (reason) => {
    void shutdown(reason);
  },
});
const discordDeliveryDispatcher = startDiscordDeliveryDispatcher({ prisma, config });
const server = createServer(app);

server.listen(config.port, () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  console.log(`TF20 runtime foundation listening on port ${port}`);
});

const shutdown = async (signal) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down.`);
  discordDeliveryDispatcher.stop();
  server.close(async (error) => {
    if (error) {
      console.error("Server close failed.", error);
      await prisma.$disconnect();
      process.exit(1);
    }

    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
