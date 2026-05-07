import { config } from "../config.js";

const steamOpenIdEndpoint = "https://steamcommunity.com/openid/login";
const steamIdPattern = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export function buildSteamLinkUrl({ state }) {
  const returnTo = new URL("/auth/steam/callback", config.appBaseUrl);
  returnTo.searchParams.set("state", state);

  const realm = new URL(config.appBaseUrl);
  const url = new URL(steamOpenIdEndpoint);
  url.searchParams.set("openid.ns", "http://specs.openid.net/auth/2.0");
  url.searchParams.set("openid.mode", "checkid_setup");
  url.searchParams.set("openid.return_to", returnTo.toString());
  url.searchParams.set("openid.realm", realm.origin);
  url.searchParams.set("openid.identity", "http://specs.openid.net/auth/2.0/identifier_select");
  url.searchParams.set("openid.claimed_id", "http://specs.openid.net/auth/2.0/identifier_select");
  return url.toString();
}

export async function verifySteamOpenId(query) {
  const mode = queryValue(query["openid.mode"]);
  if (mode !== "id_res") {
    const error = new Error("Steam authentication was not completed.");
    error.statusCode = 400;
    throw error;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("openid.")) {
      params.set(key, queryValue(value));
    }
  }
  params.set("openid.mode", "check_authentication");

  const response = await fetch(steamOpenIdEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!response.ok) {
    const error = new Error("Unable to verify Steam authentication.");
    error.statusCode = 502;
    throw error;
  }

  const body = await response.text();
  if (!body.split("\n").some((line) => line.trim() === "is_valid:true")) {
    const error = new Error("Steam authentication could not be verified.");
    error.statusCode = 400;
    throw error;
  }

  const claimedId = queryValue(query["openid.claimed_id"]);
  const match = claimedId.match(steamIdPattern);
  if (!match) {
    const error = new Error("Steam did not return a valid Steam64 ID.");
    error.statusCode = 400;
    throw error;
  }

  return match[1];
}

export async function fetchSteamPlayerSummary(steam64Id) {
  const fallback = {
    steam64Id,
    steamUsername: null,
    steamProfileUrl: `https://steamcommunity.com/profiles/${steam64Id}/`,
    steamAvatarUrl: null,
  };

  if (!config.steam.webApiKey) {
    return fallback;
  }

  const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/");
  url.searchParams.set("key", config.steam.webApiKey);
  url.searchParams.set("steamids", steam64Id);

  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error("Unable to pull Steam profile details.");
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  const player = payload?.response?.players?.[0];
  if (!player) {
    return fallback;
  }

  return {
    steam64Id: player.steamid || steam64Id,
    steamUsername: player.personaname || null,
    steamProfileUrl: player.profileurl || fallback.steamProfileUrl,
    steamAvatarUrl: player.avatarfull || player.avatarmedium || player.avatar || null,
  };
}

function queryValue(value) {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}
