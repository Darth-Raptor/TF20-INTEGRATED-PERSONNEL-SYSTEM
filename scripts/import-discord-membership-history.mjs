import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

import { loadConfig } from "../src/server/config.mjs";
import {
  ingestDiscordMembershipEvent,
  normalizeDiscordMembershipEventPayload,
} from "../src/server/discord-membership-service.mjs";

export function parseDiscordMembershipHistoryText(text, filePath = "") {
  const format = detectFormat(filePath, text);
  if (format === "jsonl") {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => parseJsonLine(line, index + 1));
  }

  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.events)) {
    return parsed.events;
  }

  throw new Error(
    "Discord membership history import expects a JSON array or an object with an events array.",
  );
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.filePath) {
    throw new Error(
      "Usage: node scripts/import-discord-membership-history.mjs --file <path> [--apply]",
    );
  }

  const fullPath = path.resolve(args.filePath);
  const text = fs.readFileSync(fullPath, "utf8");
  const rows = parseDiscordMembershipHistoryText(text, fullPath);
  const normalized = rows.map((row, index) => ({
    rowNumber: index + 1,
    payload: row,
    result: normalizeDiscordMembershipEventPayload(row),
  }));

  const invalid = normalized.filter((entry) => !entry.result.ok);
  if (invalid.length) {
    for (const entry of invalid.slice(0, 10)) {
      console.error(`Row ${entry.rowNumber}: ${entry.result.message}`);
    }
    throw new Error(`Import blocked: ${invalid.length} row(s) are invalid.`);
  }

  const summary = {
    rows: normalized.length,
    created: 0,
    duplicates: 0,
  };

  if (!args.apply) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          rows: summary.rows,
          valid: summary.rows,
          message:
            "Dry run complete. Re-run with --apply to persist Discord membership history events.",
        },
        null,
        2,
      ),
    );
    return;
  }

  const prisma = new PrismaClient();
  try {
    const config = loadConfig();
    for (const entry of normalized) {
      const ingested = await ingestDiscordMembershipEvent({
        prisma,
        config,
        payload: entry.payload,
      });
      if (!ingested.ok) {
        throw new Error(`Row ${entry.rowNumber}: ${ingested.message}`);
      }
      if (ingested.created) {
        summary.created += 1;
      } else {
        summary.duplicates += 1;
      }
    }

    console.log(JSON.stringify({ dryRun: false, ...summary }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

function parseArgs(args) {
  const result = {
    apply: false,
    filePath: "",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") {
      result.apply = true;
      continue;
    }
    if (arg === "--file") {
      result.filePath = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--file=")) {
      result.filePath = arg.slice("--file=".length);
    }
  }

  return result;
}

function detectFormat(filePath, text) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jsonl" || extension === ".ndjson") {
    return "jsonl";
  }
  if (extension === ".json") {
    return "json";
  }

  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : "jsonl";
}

function parseJsonLine(line, rowNumber) {
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`Invalid JSONL on row ${rowNumber}: ${error.message}`, { cause: error });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
