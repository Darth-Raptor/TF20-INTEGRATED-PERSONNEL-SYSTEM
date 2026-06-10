import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateSiteMapText } from "../src/shared/site-map.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const siteMapPath = path.join(projectRoot, "docs", "SITE_MAP.TXT");
const siteMapText = fs.readFileSync(siteMapPath, "utf8");
const result = validateSiteMapText(siteMapText);

if (!result.ok) {
  for (const error of result.errors) {
    console.error(error);
  }

  process.exitCode = 1;
} else {
  console.log(
    `Site map check passed: ${result.parsed.sections.length} sections, ${result.parsed.pages.length} pages, ${result.parsed.subpages.length} subpages.`,
  );
}
