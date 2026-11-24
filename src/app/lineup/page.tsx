"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** The lineup tool now lives on the Matchup screen. */
export default function LineupRedirect() {
  const router = useRouter();
  const sp = useSearchParams();
  useEffect(() => { router.replace(`/matchup/${sp.toString() ? `?${sp.toString()}` : ""}`); }, [router, sp]);
  return null;
}
