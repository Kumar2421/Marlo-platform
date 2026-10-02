import type { Actor } from "@/lib/services/types";
import type { Schema } from "./schema";

export type ToolScope = "read" | "write" | "send" | "admin";

export type ToolContext = { actor: Actor; scopes: Set<string> };

export type ToolDef = {
  name: string;
  title: string;
  description: string;
  scope: ToolScope;
  /** Destructive tools are flagged so clients can ask for confirmation. */
  destructive?: boolean;
  inputSchema: Schema;
  handler: (ctx: ToolContext, args: Record<string, unknown>) => Promise<unknown>;
};

export const obj = (properties: Record<string, Schema>, required: string[] = []): Schema => ({
  type: "object", properties, required, additionalProperties: false,
});

export const str = (description: string, extra: Partial<Schema> = {}): Schema => ({ type: "string", description, ...extra });
export const int = (description: string, minimum?: number, maximum?: number): Schema => ({ type: "integer", description, minimum, maximum });
export const bool = (description: string): Schema => ({ type: "boolean", description });
export const strList = (description: string, maxItems = 200): Schema => ({ type: "array", description, maxItems, items: { type: "string" } });

export const leadFields: Record<string, Schema> = {
  name: str("Full name", { maxLength: 160 }),
  title: str("Job title", { maxLength: 160 }),
  company: str("Company", { maxLength: 160 }),
  location: str("Location", { maxLength: 160 }),
  email: str("Email address exactly as found at the source. Never guess or pattern-generate emails.", { maxLength: 254 }),
  phone: str("Phone", { maxLength: 60 }),
  source_url: str("URL where this person was found", { maxLength: 500 }),
  query: str("Search or import label", { maxLength: 300 }),
  tags: strList("Tags for segmentation", 20),
  notes: str("Free-form notes", { maxLength: 2000 }),
};

export const leadStatusEnum = ["new", "sent", "replied", "failed", "unsubscribed"] as const;
