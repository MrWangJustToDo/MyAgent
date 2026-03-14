import { Box } from "ink";

import { useSize } from "../hooks";

import type { BoxProps } from "ink";
import type { ReactNode } from "react";

export const FullBox = (props: BoxProps & { children?: ReactNode }) => {
  const width = useSize((s) => s.state.screenWidth);

  return <Box {...props} width={width} />;
};
