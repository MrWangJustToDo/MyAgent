import { Fragment, memo, type JSX } from "react";

import { useDynamic } from "../hooks/use-dynamic";
import { useInit } from "../hooks/use-init";
import { useStatic } from "../hooks/use-static";
import { useWorkspaceInfo } from "../hooks/use-workspace-info";

export const Content = memo(() => {
  const loading = useInit((s) => s.loading);

  // Individual rows arrive already cached: each is its own `<StaticRender>` leaf built by
  // `MessageList`, so nothing here re-caches them. Depending on a transcript-wide tool
  // signature is what used to pin every row to every other row's updates — it is gone.
  // `list` and `head` are replaced (never mutated) by their setters, so identity is a
  // sufficient change signal here.
  const { head, list } = useStatic((s) => ({ list: s.list, head: s.header }));

  const hasPath = useWorkspaceInfo((s) => s.workspaceInfo.path);

  const dynamicList = useDynamic((s) => s.list);

  const typedList = list as JSX.Element[];

  if (!hasPath) return null;

  return (
    <Fragment key={String(loading)}>
      {/*
       * The welcome panel is its own cache unit, rendered from outside the transcript's row
       * budget. It must always be visible: the budget is counted in rendered LINES, so a tall
       * enough transcript would otherwise be able to push the panel — which is the user's
       * orientation (workspace, git, remote planes) — out of the kept region. `headerSet` is
       * the header's own change signal (`Header` republishes on git/workspace/width changes),
       * so this re-caches on real changes instead of on every repaint.
       */}
      {head}
      {typedList}
      {dynamicList}
    </Fragment>
  );
});

Content.displayName = "Content";
