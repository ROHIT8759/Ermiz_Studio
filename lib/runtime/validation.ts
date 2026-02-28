import { z } from "zod";
import { NodeDataSchema } from "@/lib/schema/node";

const RuntimeGraphNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().optional(),
  data: NodeDataSchema,
});

const RuntimeGraphEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
});

const RuntimeGraphStateSchema = z.object({
  nodes: z.array(RuntimeGraphNodeSchema).default([]),
  edges: z.array(RuntimeGraphEdgeSchema).optional(),
});

export const RuntimeGraphCollectionSchema = z
  .object({
    api: RuntimeGraphStateSchema.optional(),
    infra: RuntimeGraphStateSchema.optional(),
    database: RuntimeGraphStateSchema.optional(),
    functions: RuntimeGraphStateSchema.optional(),
    agent: RuntimeGraphStateSchema.optional(),
    deploy: RuntimeGraphStateSchema.optional(),
  })
  .refine(
    (graphs) =>
      Object.values(graphs).some(
        (graph) => Boolean(graph) && (graph?.nodes.length ?? 0) > 0,
      ),
    {
      message: "At least one graph tab with nodes is required",
      path: ["graphs"],
    },
  );

export const RuntimeStartPayloadSchema = z.object({
  graphs: RuntimeGraphCollectionSchema,
});

export type RuntimeStartPayload = z.infer<typeof RuntimeStartPayloadSchema>;
