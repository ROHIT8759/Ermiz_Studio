import { GraphCollection } from "@/lib/runtime/architecture";

let activeGraphs: GraphCollection | null = null;
let activeGraphsUpdatedAt: string | null = null;

const cloneGraphs = (graphs: GraphCollection): GraphCollection =>
  JSON.parse(JSON.stringify(graphs)) as GraphCollection;

export const setActiveRuntimeGraphs = (graphs: GraphCollection): void => {
  activeGraphs = cloneGraphs(graphs);
  activeGraphsUpdatedAt = new Date().toISOString();
};

export const getActiveRuntimeGraphs = (): GraphCollection | null => {
  if (!activeGraphs) return null;
  return cloneGraphs(activeGraphs);
};

export const getActiveRuntimeGraphsUpdatedAt = (): string | null =>
  activeGraphsUpdatedAt;
