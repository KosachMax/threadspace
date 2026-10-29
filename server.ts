import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { defaultAppearance, type ProjectAppearance } from "./src/preferences";
import { appearanceSchema, appearancePatchSchema } from "./src/appearanceSchema";
import { createTitleRegenerator, titleRegenerationResultSchema } from "./src/titleGeneration";

const projectId = z.string().min(1).max(200);
export const rpcContract = defineRpcContract({
  appearance_get: {
    input: z.object({ projectIds: z.array(projectId).max(2000) }).strict(),
    output: z.record(z.string(), appearanceSchema),
  },
  appearance_set: {
    input: z.object({ projectId, patch: appearancePatchSchema }).strict(),
    output: appearanceSchema,
  },
  project_order_get: {
    input: z.object({}).strict(),
    output: z.array(projectId).max(2000),
  },
  project_order_set: {
    input: z.object({ projectIds: z.array(projectId).max(2000) }).strict(),
    output: z.array(projectId).max(2000),
  },
  title_regenerate: {
    input: z.object({ threadId: z.string().min(1).max(200) }).strict(),
    output: titleRegenerationResultSchema,
  },
});

export default function plugin(bb: BbPluginApi) {
  // Read the late-bound SDK in the RPC handler, after the server is listening.
  let titles: ReturnType<typeof createTitleRegenerator> | undefined;
  bb.onDispose(() => titles?.dispose());
  // Serialize read/merge/write so edits from two windows cannot erase each other.
  let writes: Promise<unknown> = Promise.resolve();
  async function read(id: string): Promise<ProjectAppearance> {
    const saved = appearanceSchema.safeParse(await bb.storage.kv.get(`project:${id}`));
    return saved.success ? saved.data : { ...defaultAppearance };
  }
  bb.rpc.register(rpcContract, {
    title_regenerate: ({ threadId }) => {
      titles ??= createTitleRegenerator(bb.sdk);
      return titles.regenerate(threadId);
    },
    project_order_get: async () => {
      await writes;
      const saved = z.array(projectId).max(2000).safeParse(await bb.storage.kv.get("project-order"));
      return saved.success ? saved.data : [];
    },
    project_order_set: ({ projectIds }) => {
      const next = writes.then(async () => {
        const unique = [...new Set(projectIds)];
        await bb.storage.kv.set("project-order", unique);
        bb.realtime.publish("project-order-changed", {});
        return unique;
      });
      writes = next.catch(() => {});
      return next;
    },
    appearance_get: async ({ projectIds }) => {
      await writes;
      return Object.fromEntries(await Promise.all([...new Set(projectIds)].map(async id => [id, await read(id)])));
    },
    appearance_set: ({ projectId: id, patch }) => {
      const next = writes.then(async () => {
        const value = appearanceSchema.parse({ ...await read(id), ...patch });
        await bb.storage.kv.set(`project:${id}`, value);
        bb.realtime.publish("appearance-changed", { projectId: id });
        return value;
      });
      writes = next.catch(() => {});
      return next;
    },
  });
}
