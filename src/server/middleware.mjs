import { parseCookies, verifySignedCookieValue } from "./cookies.mjs";
import { sendError } from "./errors.mjs";

export function buildRequestContextMiddleware({ prisma, config }) {
  return async function requestContextMiddleware(req, res, next) {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const signedSessionId = cookies[config.sessionCookieName];
      if (!signedSessionId) {
        req.context = anonymousContext();
        return next();
      }

      const sessionId = verifySignedCookieValue(signedSessionId, config.sessionSecret);
      if (!sessionId) {
        req.context = anonymousContext();
        return next();
      }

      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          account: {
            include: {
              authIdentities: true,
              roleAssignments: {
                include: {
                  role: {
                    include: {
                      permissions: {
                        include: {
                          permission: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!session || session.revokedAt || session.expiresAt <= new Date()) {
        req.context = anonymousContext();
        return next();
      }

      const revokedByScope = await prisma.sessionRevocation.findFirst({
        where: {
          OR: [{ scope: "Global" }, { scope: "Account", targetAccountId: session.accountId }],
        },
        orderBy: { createdAt: "desc" },
      });

      if (revokedByScope && revokedByScope.createdAt > session.createdAt) {
        req.context = anonymousContext();
        return next();
      }

      req.context = {
        session,
        account: session.account,
        authIdentity:
          session.account.authIdentities.find((identity) => identity.provider === "Discord") ?? null,
      };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requireAuthenticatedSession(req, res, next) {
  if (!req.context?.session || !req.context?.account || !req.context?.authIdentity) {
    return sendError(res, 401, "not_authenticated", "Authentication is required.");
  }

  return next();
}

function anonymousContext() {
  return {
    session: null,
    account: null,
    authIdentity: null,
  };
}
