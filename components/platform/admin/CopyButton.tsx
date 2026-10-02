"use client";

import { useState } from "react";

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  async function copy(event: React.MouseEvent) {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } catch { /* clipboard unavailable */ }
  }
  return <button type="button" onClick={copy} aria-label="Copy">{done ? "Copied" : label ?? "Copy"}</button>;
}

export function CopyText({ value, shown }: { value: string; shown?: string }) {
  return <span className="st-copy"><span title={value}>{shown ?? value}</span><CopyButton value={value} /></span>;
}
