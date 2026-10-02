"use client";

import { useCallback, useEffect, useRef, useState } from "react";

async function parse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${response.status})`);
  return data;
}

export async function apiGet<T = unknown>(url: string): Promise<T> {
  return parse(await fetch(url, { cache: "no-store" })) as Promise<T>;
}

export async function apiPost<T = unknown>(url: string, body: unknown): Promise<T> {
  return parse(await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })) as Promise<T>;
}

/** GET with loading/error state. Pass null to skip fetching. Re-fetches when `url` changes. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(url));
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!url) return;
    const id = ++seq.current;
    setLoading(true);
    try {
      const next = await apiGet<T>(url);
      if (id === seq.current) { setData(next); setError(""); }
    } catch (err) {
      if (id === seq.current) setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

export function fmtDate(value: string | number | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function timeAgo(value: string | number | null | undefined) {
  if (!value) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
