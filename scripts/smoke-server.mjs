import { createApp } from "../src/server/app.js";

async function main() {
  const app = createApp();

  await new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1");
    const timeout = setTimeout(() => {
      server.close(() => reject(new Error("Smoke boot timed out.")));
    }, 5000);

    server.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    server.once("listening", () => {
      clearTimeout(timeout);
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
