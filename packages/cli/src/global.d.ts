declare global {
  type DePromise<T> = T extends Promise<infer Q> ? DePromise<Q> : T;
  type SplitUndefined<T> = T extends undefined ? never : T
}


export {};