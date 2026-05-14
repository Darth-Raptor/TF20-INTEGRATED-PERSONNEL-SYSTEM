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
import { startDiscordGuildSync } from "./services/discord-guild-sync.js";
import { createSessionStore } from "./services/session-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

function createSimpleRateLimiter({ windowMs, limit, message, keyPrefix }) {
  const hits = new Map();

  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip || "unknown"}`;
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.expiresAt <= now) {
      hits.set(key, { count: 1, expiresAt: now + windowMs });
      next();
      return;
    }

    if (entry.count >= limit) {
      res.status(429).json({ error: message });
      return;
    }

    entry.count += 1;
    hits.set(key, entry);
    next();
  };
}

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
  startDiscordGuildSync();

  const loginRateLimit = createSimpleRateLimiter({
    windowMs: 5 * 60 * 1000,
    limit: 20,
    message: "Too many login attempts. Please wait a few minutes and try again.",
    keyPrefix: "login",
  });
  const writeRateLimit = createSimpleRateLimiter({
    windowMs: 60 * 1000,
    limit: 80,
    message: "Too many write requests. Slow down and try again shortly.",
    keyPrefix: "writes",
  });

  app.use("/assets", express.static(path.join(projectRoot, "assets"), { immutable: true, maxAge: "1d" }));
  app.use("/portal-scripts", express.static(path.join(projectRoot, "portal-scripts"), { maxAge: "1d" }));
  app.get("/favicon.ico", (req, res) => {
    res.type("png").sendFile(path.join(projectRoot, "assets", "tf20-favicon.png"));
  });
  app.get("/styles.css", (req, res) => res.sendFile(path.join(projectRoot, "styles.css")));
  app.get("/portal.css", (req, res) => res.sendFile(path.join(projectRoot, "portal.css")));
  app.get("/portal.js", (req, res) => res.sendFile(path.join(projectRoot, "portal.js")));
  app.use("/login", loginRateLimit);
  app.use("/auth/discord/callback", loginRateLimit);
  app.use("/api", (req, res, next) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
      writeRateLimit(req, res, next);
      return;
    }
    next();
  });

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
