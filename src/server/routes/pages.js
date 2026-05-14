import path from "node:path";
import express from "express";
import passport from "passport";

import { requireAuth } from "../middleware/auth.js";
import {
  canAccessPortalPage,
  getPortalPage,
  renderForbiddenPortalPage,
  renderMissingPortalPage,
  renderPortalPage,
} from "../services/portal-pages.js";

export function pageRouter(projectRoot) {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.sendFile(path.join(projectRoot, "index.html"));
  });

  router.get("/login", (req, res) => {
    if (!passport._strategy("discord")) {
      res.status(503).send("Discord OAuth is not configured yet.");
      return;
    }
    passport.authenticate("discord")(req, res);
  });

  router.get(
    "/auth/discord/callback",
    passport.authenticate("discord", {
      failureRedirect: "/login",
    }),
    (req, res) => {
      res.redirect("/portal");
    },
  );

  router.post("/logout", (req, res, next) => {
    req.logout((error) => {
      if (error) {
        next(error);
        return;
      }
      res.redirect("/");
    });
  });

  router.get("/portal", requireAuth, (req, res) => {
    res.redirect("/portal/dashboard");
  });

  router.get("/portal.html", requireAuth, (req, res) => {
    res.redirect("/portal/dashboard");
  });

  router.get("/portal/:page", requireAuth, (req, res) => {
    const page = getPortalPage(req.params.page);

    if (!page) {
      res.status(404).send(renderMissingPortalPage({ projectRoot, requestedPageId: req.params.page, user: req.user }));
      return;
    }

    if (!canAccessPortalPage(req.user, page)) {
      res.status(403).send(renderForbiddenPortalPage({ projectRoot, requestedPage: page, user: req.user }));
      return;
    }

    res.send(renderPortalPage({ projectRoot, page, user: req.user }));
  });

  return router;
}
