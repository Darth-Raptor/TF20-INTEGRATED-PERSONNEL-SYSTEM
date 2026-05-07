import { Strategy as DiscordStrategy } from "passport-discord";

import { config } from "../config.js";
import { isDbConfigured } from "../db.js";
import { getSessionUserById, upsertDiscordUser } from "../services/users.js";

const scopes = ["identify"];

export function configureAuth(passport) {
  if (config.discord.clientId && config.discord.clientSecret) {
    passport.use(
      new DiscordStrategy(
        {
          clientID: config.discord.clientId,
          clientSecret: config.discord.clientSecret,
          callbackURL: config.discord.callbackUrl,
          scope: scopes,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const user = await upsertDiscordUser(profile);
            if (user.accountLocked || user.accountDisabled) {
              done(null, false, { message: "This account is not active." });
              return;
            }
            done(null, user);
          } catch (error) {
            done(error);
          }
        },
      ),
    );
  }

  passport.serializeUser((user, done) => {
    if (isDbConfigured() && user.id && !user.id.startsWith("discord:")) {
      done(null, { id: user.id });
      return;
    }
    done(null, { fallbackUser: user });
  });

  passport.deserializeUser(async (sessionUser, done) => {
    try {
      if (sessionUser?.fallbackUser) {
        done(null, sessionUser.fallbackUser);
        return;
      }

      const user = await getSessionUserById(sessionUser?.id);
      done(null, user || false);
    } catch (error) {
      done(error);
    }
  });
}

export function requireAuth(req, res, next) {
  if (req.isAuthenticated?.()) {
    next();
    return;
  }
  if (req.originalUrl?.startsWith("/api/")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.redirect("/login");
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const roles = req.user?.roles || [];
    const permissions = req.user?.permissions || [];
    if (allowedRoles.some((role) => roles.includes(role) || permissions.includes(role))) {
      next();
      return;
    }
    res.status(403).json({ error: "Forbidden" });
  };
}
