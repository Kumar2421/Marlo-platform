"use client";

import { Fragment, useState, type ReactNode } from "react";
import { fmtDate } from "@/components/platform/api";
import { Badge, Empty, statusTone } from "@/components/platform/ui";

export type Row = Record<string, unknown> & { id?: string | number };

const TITLE_KEYS = ["title", "name", "message", "description", "rule", "file", "path"];

export function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

export function rowTitle(row: Row): string {
  for (const key of TITLE_KEYS) {
    const v = str(row[key]);
    if (v) return v;
  }
  return str(row.id) || "(untitled)";
}

export function FixTable({ rows, empty, action }: { rows: Row[]; empty: string; action?: (row: Row) => ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="pf-table-wrap">
      <table className="pf-table">
        <thead><tr><th>Title</th><th>Status</th><th>Severity</th><th>Project</th><th>Created</th>{action && <th></th>}</tr></thead>
        <tbody>
          {rows.map((row, index) => {
            const key = str(row.id) || String(index);
            const status = str(row.status);
            const severity = str(row.severity);
            return (
              <Fragment key={key}>
                <tr className={`st-click${open === key ? " sel" : ""}`} onClick={() => setOpen(open === key ? null : key)}>
                  <td><strong>{rowTitle(row)}</strong><small className="pf-mono">{key.slice(0, 8)}</small></td>
                  <td>{status ? <Badge tone={statusTone(status)}>{status}</Badge> : "—"}</td>
                  <td>{severity ? <Badge tone={statusTone(severity)}>{severity}</Badge> : "—"}</td>
                  <td className="pf-mono">{str(row.project_id).slice(0, 8) || "—"}</td>
                  <td>{fmtDate(str(row.created_at) || null)}</td>
                  {action && <td onClick={(e) => e.stopPropagation()}>{action(row)}</td>}
                </tr>
                {open === key && (
                  <tr><td colSpan={action ? 6 : 5} className="wrap"><pre className="pf-pre">{JSON.stringify(row, null, 2)}</pre></td></tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
