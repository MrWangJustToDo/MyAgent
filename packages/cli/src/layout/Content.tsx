import { StaticRender } from "ink";
import { memo, type JSX } from "react";

import { useSize } from "../hooks";
import { useDynamic } from "../hooks/use-dynamic";
import { useStatic } from "../hooks/use-static";

export const Content = memo(() => {
  const { head, list } = useStatic((s) => ({ list: s.list, head: s.header }));

  const dynamicList = useDynamic((s) => s.list);

  const width = useSize((s) => s.state.screenWidth);

  const typedList = list as JSX.Element[];

  const validList = [head, ...typedList].filter(Boolean);

  return (
    <>
      {/* @ts-expect-error - ink StaticRender types don't include key but React handles it */}
      <StaticRender width={width} key={validList.length}>
        {validList}
      </StaticRender>
      {dynamicList}
    </>
  );
});

Content.displayName = "Content";
