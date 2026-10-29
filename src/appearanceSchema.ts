import { z } from "zod";
import { colorNames, isEmoji } from "./preferences";

// Only the server imports schemas: the sidebar needs the small value types and
// emoji predicate, without shipping the server's validation runtime to the UI.
export const appearanceSchema = z.object({ emoji: z.string().refine(isEmoji).nullable(), color: z.enum(colorNames) }).strict();
export const appearancePatchSchema = appearanceSchema.partial().refine(patch => Object.keys(patch).length > 0, "Choose an emoji or a color");
