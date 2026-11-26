import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Shell } from "@/components/Shell";

const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "SHS Fantasy HQ",
  description: "Personal fantasy football command centre for Sleeper leagues.",
  manifest: `${BP}/manifest.webmanifest`,
  icons: { icon: `${BP}/favicon.png?v=6`, apple: `${BP}/apple-touch-icon.png?v=6` },
  appleWebApp: { capable: true, title: "Fantasy HQ", statusBarStyle: "black" },
};
export const viewport: Viewport = { themeColor: "#0a0a0a", width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover", interactiveWidget: "resizes-content" };

// Applies the saved theme before first paint.
/**
 * Behave like an app, not a web page: no pinch or double-tap zoom, and when the iPhone keyboard opens the app
 * shrinks to the visible area instead of the whole page sliding up (html.kb-open hides the tab bar meanwhile).
 */
const appScript = `(function(){var d=document;['gesturestart','gesturechange','gestureend'].forEach(function(t){d.addEventListener(t,function(e){e.preventDefault()},{passive:false})});
d.addEventListener('touchmove',function(e){if(e.touches&&e.touches.length>1)e.preventDefault()},{passive:false});
var vv=window.visualViewport;if(!vv)return;function fit(){var h=vv.height,full=window.innerHeight;var open=full-h>120;d.documentElement.classList.toggle('kb-open',open);d.body.style.height=open?h+'px':'';if(window.scrollY||vv.offsetTop)window.scrollTo(0,0)}
vv.addEventListener('resize',fit);vv.addEventListener('scroll',fit);window.addEventListener('scroll',function(){if(window.scrollY)window.scrollTo(0,0)});d.addEventListener('focusout',function(){setTimeout(fit,50)})})();`;

const themeScript = `try{if(localStorage.getItem("fhq-theme")!=="light")document.documentElement.classList.add("dark")}catch(e){document.documentElement.classList.add("dark")}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: appScript }} />
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
