/** Serves fixture files for every URL the app requests (Sleeper API, Sleeper projections, site data). */
import fs from "node:fs";
import path from "node:path";
import { setTransport } from "@/lib/net";
import { resetSettingsForTests, type AppSettings } from "@/lib/settings";

export const FIXTURES = path.join(__dirname, "fixtures", "generated");
export const DATA = path.join(__dirname, "..", "public", "data");

export function fixtureFile(url: string): string {
  const u = new URL(url);
  if (u.hostname === "api.sleeper.app" && u.pathname.startsWith("/projections/")) {
    const [, , , season, week] = u.pathname.split("/");
    return path.join(FIXTURES, "sleeper", `projections__${season}__${week}.json`);
  }
  if (u.hostname === "api.sleeper.app") return path.join(FIXTURES, "sleeper", u.pathname.replace(/^\/v1\//, "").replace(/\//g, "__") + ".json");
  if (u.pathname.includes("/data/")) return path.join(DATA, u.pathname.split("/data/")[1]);
  throw new Error(`no fixture for ${url}`);
}

export function useFixtures(settings: Partial<AppSettings> = {}) {
  resetSettingsForTests({ username: "L1am", userId: "389682598735060992", ...settings });
  setTransport(async (url) => {
    const f = fixtureFile(url);
    if (!fs.existsSync(f)) throw new Error(`404 for ${url}`);
    return fs.readFileSync(f, "utf8");
  });
}
