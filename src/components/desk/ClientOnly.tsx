"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** Renders children only in the browser (the desk reads the clock and local storage), with a quiet placeholder on the server. */
export function ClientOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? <>{children}</> : <>{fallback ?? null}</>;
}
