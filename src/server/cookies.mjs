import crypto from "node:crypto";

export function parseCookies(headerValue) {
  if (!headerValue) return {};

  return headerValue.split(";").reduce((cookies, cookie) => {
    const [rawName, ...rawValue] = cookie.split("=");
    const name = rawName?.trim();
    if (!name) return cookies;
    cookies[name] = decodeURIComponent(rawValue.join("=").trim());
    return cookies;
  }, {});
}

export function signCookieValue(value, secret) {
  const signature = crypto.createHmac("sha256", secret).update(value).digest("base64url");
  return `${value}.${signature}`;
}

export function verifySignedCookieValue(value, secret) {
  if (!value) return null;
  const separatorIndex = value.lastIndexOf(".");
  if (separatorIndex <= 0) return null;

  const payload = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");

  const isMatch = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  return isMatch ? payload : null;
}

export function appendCookie(res, cookieString) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", [cookieString]);
    return;
  }

  const next = Array.isArray(current) ? current.concat(cookieString) : [current, cookieString];
  res.setHeader("Set-Cookie", next);
}

export function buildCookie(name, value, options = {}) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? "/"}`,
    `HttpOnly`,
    `SameSite=${options.sameSite ?? "Lax"}`,
  ];

  if (options.maxAgeSeconds != null) {
    attributes.push(`Max-Age=${options.maxAgeSeconds}`);
  }
  if (options.expires) {
    attributes.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (options.secure) {
    attributes.push(`Secure`);
  }
  if (options.domain) {
    attributes.push(`Domain=${options.domain}`);
  }

  return attributes.join("; ");
}

export function createRandomId() {
  return crypto.randomBytes(24).toString("hex");
}
