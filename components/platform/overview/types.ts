import type { PlatformOverview } from "@/lib/platform-data";

export type OverviewData = {
  overview: Omit<PlatformOverview, "userDirectory" | "projectDirectory">;
  health?: { service: string; latest: { status: string } | null }[];
  trends?: { days?: string[]; usage?: number[]; platform_leads?: number[]; emails_sent?: number[]; signups?: number[] } | null;
};

export function goTab(tab: string) {
  if (typeof window !== "undefined") window.location.hash = `#${tab}`;
}

export function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
