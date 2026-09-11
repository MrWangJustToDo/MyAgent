import { Box } from "ink";

import { ExtensionRenderSurface } from "../components/ExtensionRenderSurface.js";
import { useExtensionUI } from "../hooks/use-extension-ui.js";

/**
 * Extension render surface for the `footer` region — one slot per key, sorted so
 * ordering is deterministic regardless of publish order. Rendered above the
 * footer border and visible in every agent status.
 */
export const FooterExtensionSurface = () => {
  const slots = useExtensionUI((s) => s.surfaces.footer);

  const keys = slots ? Object.keys(slots).sort() : [];
  if (keys.length === 0) return null;

  return (
    <Box flexDirection="column" paddingX={1}>
      {keys.map((key) => (
        <ExtensionRenderSurface key={key} payload={slots![key]} />
      ))}
    </Box>
  );
};
