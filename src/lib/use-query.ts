"use client";

import { useEffect, useState } from "react";

/** Reads a URL query parameter on the client (avoids Suspense requirements of useSearchParams). */
export function useQueryParam(name: string) {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    setValue(new URLSearchParams(window.location.search).get(name));
  }, [name]);
  return value;
}
