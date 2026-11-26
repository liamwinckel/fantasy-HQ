import type { MetadataRoute } from "next";

export const dynamic = "force-static";
const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SHS Fantasy HQ",
    short_name: "Fantasy HQ",
    start_url: `${BP}/`,
    scope: `${BP}/`,
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: `${BP}/icon-192.png?v=7`, sizes: "192x192", type: "image/png" },
      { src: `${BP}/icon-512.png?v=7`, sizes: "512x512", type: "image/png" },
    ],
  };
}
