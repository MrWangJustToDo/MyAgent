declare global {
  type DePromise<T> = T extends Promise<infer Q> ? DePromise<Q> : T;
}


export {};