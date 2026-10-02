import { leadTools } from "./leads";
import { outreachTools } from "./outreach";
import { platformTools } from "./platform";
import { replyTools } from "./replies";
import type { ToolDef } from "../registry";

export const tools: ToolDef[] = [...leadTools, ...outreachTools, ...replyTools, ...platformTools];
export const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
