import { Box } from "ink";

import { useSize } from "../hooks";

import type { BoxProps } from "ink";
import type { Key, ReactNode } from "react";

export const FullBox = (props: BoxProps & { children?: ReactNode; key?: Key }) => {
  const width = useSize((s) => s.state.screenWidth);

  return <Box {...props} width={width} />;
};
