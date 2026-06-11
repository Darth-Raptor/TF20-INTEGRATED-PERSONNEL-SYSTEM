import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const clientDistDir = path.join(projectRoot, "dist", "client");
const clientIndexPath = path.join(clientDistDir, "index.html");

const clientRoutePattern =
  /^\/(?:$|user(?:\/.*)?|staff(?:\/.*)?|recruiting(?:\/.*)?|training(?:\/.*)?|admin(?:\/.*)?|portal(?:\/.*)?|dashboard(?:\/.*)?|profile(?:\/.*)?|access(?:\/.*)?|support(?:\/.*)?|notifications(?:\/.*)?|catalogs(?:\/.*)?|events(?:\/.*)?|attendance(?:\/.*)?|loa(?:\/.*)?|serviceRecords(?:\/.*)?|audit(?:\/.*)?|integrations(?:\/.*)?)/;

export function mountClientApp(app) {
  if (!fs.existsSync(clientIndexPath)) {
    return false;
  }

  app.use(
    "/assets",
    express.static(path.join(clientDistDir, "assets"), {
      immutable: true,
      maxAge: "1y",
    }),
  );
  app.use(express.static(clientDistDir, { index: false, maxAge: "1h" }));

  app.get(clientRoutePattern, (req, res, next) => {
    if (!acceptsHtml(req)) {
      return next();
    }

    return res.sendFile(clientIndexPath);
  });

  return true;
}

function acceptsHtml(req) {
  return String(req.headers.accept ?? "").includes("text/html");
}
