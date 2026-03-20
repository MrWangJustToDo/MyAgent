import { DiffFile } from "@git-diff-view/core";

declare global {
  type DePromise<T> = T extends Promise<infer Q> ? DePromise<Q> : T;
  type SplitUndefined<T> = T extends undefined ? never : T
  
  
  var diffFileMap: Map<string, DiffFile>;
}


export {};