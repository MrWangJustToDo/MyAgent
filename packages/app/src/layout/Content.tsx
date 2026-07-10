import { StaticRender } from "ink";
import { memo, type JSX } from "react";

import { useSize } from "../hooks";
import { useDynamic } from "../hooks/use-dynamic";
import { useStatic } from "../hooks/use-static";

export const Content = memo(() => {
  const { head, list, listSet, toolCallsSignature } = useStatic((s) => ({
    list: s.list,
    listSet: s.listSet,
    head: s.header,
    toolCallsSignature: s.toolCallsSignature,
  }));

  const dynamicList = useDynamic((s) => s.list);

  const dynamicKey = useDynamic((s) => s.key);

  const width = useSize((s) => s.state.screenWidth);

  const typedList = list as JSX.Element[];

  const validList = [head, ...typedList].filter(Boolean);

  return (
    <>
      <StaticRender width={width} deps={[width, validList.length, listSet, dynamicKey, toolCallsSignature]}>
        {() => validList}
      </StaticRender>
      {dynamicList}
    </>
  );
});

Content.displayName = "Content";
