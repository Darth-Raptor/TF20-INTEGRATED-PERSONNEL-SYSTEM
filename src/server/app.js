import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import passport from "passport";

import { config, validateConfig } from "./config.js";
import { configureAuth } from "./middleware/auth.js";
import { apiRouter } from "./routes/api.js";
import { pageRouter } from "./routes/pages.js";
import { createSessionStore } from "./services/session-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

export function createApp() {
  validateConfig();

  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(
    session({
      name: "tf20.sid",
      store: createSessionStore(),
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.nodeEnv === "production",
      },
    }),
  );

  configureAuth(passport);
  app.use(passport.initialize());
  app.use(passport.session());

  app.use("/assets", express.static(path.join(projectRoot, "assets"), { immutable: true, maxAge: "1d" }));
  app.get("/favicon.ico", (req, res) => {
    res.type("png").sendFile(path.join(projectRoot, "assets", "tf20-favicon.png"));
  });
  app.get("/styles.css", (req, res) => res.sendFile(path.join(projectRoot, "styles.css")));
  app.get("/portal.css", (req, res) => res.sendFile(path.join(projectRoot, "portal.css")));
  app.get("/portal.js", (req, res) => res.sendFile(path.join(projectRoot, "portal.js")));

  app.use("/", pageRouter(projectRoot));
  app.use("/api", apiRouter());

  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    console.error(error);
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    res.status(statusCode).json({ error: statusCode === 500 ? "Internal server error" : error.message });
  });

  return app;
}
