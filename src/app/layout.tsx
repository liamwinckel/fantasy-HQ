import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Shell } from "@/components/Shell";

const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "SHS Fantasy HQ",
  description: "Personal fantasy football command centre for Sleeper leagues.",
  manifest: `${BP}/manifest.webmanifest`,
  icons: { icon: `${BP}/favicon.png`, apple: `${BP}/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: "Fantasy HQ", statusBarStyle: "black" },
};
export const viewport: Viewport = { themeColor: "#0a0a0a", width: "device-width", initialScale: 1, viewportFit: "cover" };

// Applies the saved theme before first paint.
const themeScript = `try{if(localStorage.getItem("fhq-theme")!=="light")document.documentElement.classList.add("dark")}catch(e){document.documentElement.classList.add("dark")}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <Suspense>
          <Shell>{children}</Shell>
        </Suspense>
      </body>
    </html>
  );
}
