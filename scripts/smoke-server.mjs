import { createApp } from "../src/server/app.js";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canAccessPortalPage,
  getPortalPage,
  renderForbiddenPortalPage,
  renderPortalPage,
} from "../src/server/services/portal-pages.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const app = createApp();

  await new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1");
    const timeout = setTimeout(() => {
      server.close(() => reject(new Error("Smoke boot timed out.")));
    }, 5000);

    server.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    server.once("listening", async () => {
      try {
        clearTimeout(timeout);
        const address = server.address();
        const baseUrl = `http://127.0.0.1:${address.port}`;
        const protectedResponse = await fetch(`${baseUrl}/portal/dashboard`, { redirect: "manual" });
        assert.equal(protectedResponse.status, 302);
        assert.equal(protectedResponse.headers.get("location"), "/login");

        const scriptResponse = await fetch(`${baseUrl}/portal-scripts/dashboard.js`);
        assert.equal(scriptResponse.status, 200);
        assert.match(await scriptResponse.text(), /initPage\\("dashboard"\\)/);

        assertPortalAccess();
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      } catch (error) {
        server.close(() => reject(error));
      }
    });
  });
}

function assertPortalAccess() {
  const systemUser = {
    accountStatus: "Active",
    access: { personnelScope: "all" },
    permissions: ["system:admin"],
    roles: ["system-admin"],
  };
  const staffUser = {
    accountStatus: "Active",
    access: { personnelScope: "scoped" },
    permissions: [],
    roles: ["staff"],
  };

  assert.equal(canAccessPortalPage(systemUser, getPortalPage("users")), true);
  assert.equal(canAccessPortalPage(staffUser, getPortalPage("users")), false);
  assert.equal(canAccessPortalPage(systemUser, getPortalPage("records")), true);
  assert.equal(canAccessPortalPage(staffUser, getPortalPage("records")), false);
  assert.equal(canAccessPortalPage(staffUser, getPortalPage("personnel")), true);

  const dashboardHtml = renderPortalPage({
    page: getPortalPage("dashboard"),
    projectRoot,
    user: systemUser,
  });
  assert.match(dashboardHtml, /data-portal-page="dashboard"/);
  assert.match(dashboardHtml, /href="\/portal\/users"/);

  const forbiddenHtml = renderForbiddenPortalPage({
    projectRoot,
    requestedPage: getPortalPage("records"),
    user: staffUser,
  });
  assert.match(forbiddenHtml, /Access Denied/);
  assert.doesNotMatch(forbiddenHtml, /href="\/portal\/records"/);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
