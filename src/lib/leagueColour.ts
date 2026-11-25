/** A steady accent colour per league (Sleeper has none), used for the league widgets and headers. */
const PALETTE = ["#b7791f", "#2f855a", "#3557c4", "#7c3aed", "#c2410c", "#0e7490", "#be185d", "#4d7c0f"];
export const leagueColour = (id: string) => PALETTE[[...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
