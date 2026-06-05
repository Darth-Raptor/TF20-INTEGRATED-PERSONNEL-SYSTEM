import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const port = resolvePort();
const shutdownUrl = `http://127.0.0.1:${port}/_local/shutdown`;

try {
  const response = await fetch(shutdownUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "shutdown" }),
  });

  if (response.status === 404) {
    fail(`Local shutdown endpoint is not available on port ${port}. Restart the server with the current code and try again.`);
  }

  if (!response.ok) {
    const body = await safeReadBody(response);
    fail(`Local shutdown failed with ${response.status}${body ? `: ${body}` : ""}`);
  }

  const body = await response.json();
  console.log(`Local shutdown accepted on port ${port}.`);
  if (body?.meta?.timestamp) {
    console.log(`Timestamp: ${body.meta.timestamp}`);
  }
} catch (error) {
  fail(
    error instanceof Error
      ? `Could not reach the local server on port ${port}: ${error.message}`
      : `Could not reach the local server on port ${port}.`,
  );
}

function resolvePort() {
  const envPort = process.env.PORT ?? readPortFromDotEnv();
  const parsed = Number.parseInt(envPort ?? "3000", 10);
  return Number.isFinite(parsed) ? parsed : 3000;
}

function readPortFromDotEnv() {
  const envPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(envPath)) {
    return null;
  }

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key === "PORT") {
      return stripQuotes(value);
    }
  }

  return null;
}

function stripQuotes(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

async function safeReadBody(response) {
  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
