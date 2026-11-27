"use client";

/**
 * A light tap of haptic feedback. Android: the vibration API. iPhone (iOS 18+): Safari plays the system haptic when
 * a switch-style checkbox is toggled, so a hidden one is flipped through its label. Elsewhere it does nothing.
 */
let sw: HTMLLabelElement | null = null;
export function haptic() {
  if (typeof window === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number) => boolean };
  if (nav.vibrate && !/iPhone|iPad|iPod/.test(navigator.userAgent)) { nav.vibrate(8); return; }
  try {
    if (!sw) {
      sw = document.createElement("label");
      sw.setAttribute("aria-hidden", "true");
      sw.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      sw.appendChild(input);
      document.body.appendChild(sw);
    }
    sw.click();
  } catch { /* no haptics here */ }
}
