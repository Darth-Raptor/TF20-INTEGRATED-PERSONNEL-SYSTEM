const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function send(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function sendFile(res, relativePath) {
  const filePath = path.resolve(root, relativePath);
  if (!filePath.startsWith(root + path.sep)) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, error.code === "ENOENT" ? 404 : 500, error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/" || url.pathname === "/index.html") {
    sendFile(res, "index.html");
    return;
  }

  if (url.pathname === "/api/health") {
    send(
      res,
      200,
      JSON.stringify(
        {
          status: "ok",
          app: "tf20-website-portal",
          mode: "cpanel-bridge",
          databaseConfigured: Boolean(process.env.DATABASE_URL),
          discordConfigured: Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
        },
        null,
        2,
      ),
      "application/json; charset=utf-8",
    );
    return;
  }

  if (url.pathname === "/login") {
    send(res, 503, "Discord OAuth is not configured yet.");
    return;
  }

  if (url.pathname === "/portal" || url.pathname === "/portal.html" || url.pathname.startsWith("/portal/")) {
    res.writeHead(302, { Location: "/login" });
    res.end();
    return;
  }

  if (url.pathname === "/styles.css") {
    sendFile(res, "styles.css");
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    sendFile(res, url.pathname.slice(1));
    return;
  }

  send(res, 404, "Not found");
});

server.listen(port, () => {
  console.log(`TF20 cPanel bridge listening on port ${port}`);
});
