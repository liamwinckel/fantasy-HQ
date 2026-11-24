/**
 * Game-time weather from Open-Meteo (free, no API key). Only outdoor stadiums are looked up;
 * domes and retractable roofs count as indoor. Forecasts reach about 16 days out.
 */
import { cached } from "./cache";
import { fetchText } from "./net";
import type { Game } from "./nflverse";

/** Home stadium: [latitude, longitude, indoor?]. Retractable roofs are treated as indoor. */
const STADIUMS: Record<string, [number, number, boolean]> = {
  ARI: [33.5276, -112.2626, true], ATL: [33.7554, -84.4009, true], BAL: [39.278, -76.6227, false], BUF: [42.7738, -78.787, false],
  CAR: [35.2258, -80.8528, false], CHI: [41.8623, -87.6167, false], CIN: [39.0955, -84.516, false], CLE: [41.5061, -81.6995, false],
  DAL: [32.7473, -97.0945, true], DEN: [39.7439, -105.0201, false], DET: [42.34, -83.0456, true], GB: [44.5013, -88.0622, false],
  HOU: [29.6847, -95.4107, true], IND: [39.7601, -86.1639, true], JAX: [30.3239, -81.6373, false], KC: [39.0489, -94.4839, false],
  LV: [36.0909, -115.1833, true], LAC: [33.9535, -118.3392, true], LAR: [33.9535, -118.3392, true], MIA: [25.958, -80.2389, false],
  MIN: [44.9738, -93.2575, true], NE: [42.0909, -71.2643, false], NO: [29.9511, -90.0812, true], NYG: [40.8135, -74.0745, false],
  NYJ: [40.8135, -74.0745, false], PHI: [39.9008, -75.1675, false], PIT: [40.4468, -80.0158, false], SF: [37.403, -121.97, false],
  SEA: [47.5952, -122.3316, false], TB: [27.9759, -82.5033, false], TEN: [36.1665, -86.7713, false], WAS: [38.9078, -76.8645, false],
};

export interface GameWeather {
  indoor: boolean;
  windMph: number | null;
  precipMm: number | null; // in the kickoff hour + next 2
  tempF: number | null;
  snow: boolean;
  summary: string;
}

/** Weather for every team's game in a week, keyed by NFL team. */
export async function weekWeather(games: Game[], week: number): Promise<Map<string, GameWeather>> {
  const out = new Map<string, GameWeather>();
  const wk = games.filter((g) => g.week === week);
  await Promise.all(wk.map(async (g) => {
    const st = STADIUMS[g.home];
    const indoor = !st || st[2] || g.roof === "dome" || g.roof === "closed";
    let w: GameWeather = { indoor: true, windMph: null, precipMm: null, tempF: null, snow: false, summary: "Indoors" };
    if (!indoor && !g.neutral && g.kickoff) {
      const day = g.kickoff.slice(0, 10);
      const hour = Number(g.kickoff.slice(11, 13)) || 13;
      try {
        const r = await cached(`weather:${g.home}:${day}`, "sleeper", 60 * 60_000,
          () => fetchText(`https://api.open-meteo.com/v1/forecast?latitude=${st[0]}&longitude=${st[1]}&hourly=temperature_2m,precipitation,wind_speed_10m,snowfall&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=America%2FNew_York&start_date=${day}&end_date=${day}`, 15_000),
          (b) => JSON.parse(b) as { hourly: { time: string[]; temperature_2m: number[]; precipitation: number[]; wind_speed_10m: number[]; snowfall: number[] } });
        const h = r.data.hourly;
        const i = Math.max(0, h.time.findIndex((t) => Number(t.slice(11, 13)) === hour));
        const span = [i, i + 1, i + 2].filter((k) => k < h.time.length);
        const wind = Math.max(...span.map((k) => h.wind_speed_10m[k] ?? 0));
        const precip = span.reduce((a, k) => a + (h.precipitation[k] ?? 0), 0);
        const snow = span.some((k) => (h.snowfall[k] ?? 0) > 0.1);
        const temp = h.temperature_2m[i] ?? null;
        const bits = [`${Math.round(wind)} mph wind`, temp !== null ? `${Math.round(temp)}°F` : "", snow ? "snow" : precip >= 2 ? "rain" : ""].filter(Boolean);
        w = { indoor: false, windMph: Math.round(wind), precipMm: Math.round(precip * 10) / 10, tempF: temp, snow, summary: bits.join(", ") };
      } catch {
        w = { indoor: false, windMph: null, precipMm: null, tempF: null, snow: false, summary: "Forecast unavailable" };
      }
    } else if (!indoor) {
      w = { indoor: false, windMph: null, precipMm: null, tempF: null, snow: false, summary: "Outdoors" };
    }
    out.set(g.home, w);
    out.set(g.away, w);
  }));
  return out;
}
