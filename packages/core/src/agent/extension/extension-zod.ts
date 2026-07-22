import { z } from "zod";

/** Host Zod `z` object type (for {@link ExtensionContext.z}). */
export type ExtensionZod = typeof z;

/** Re-export host Zod for {@link ExtensionRunner} context wiring. */
export { z };
