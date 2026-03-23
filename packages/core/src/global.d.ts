declare global {
  type DePromise<T> = T extends Promise<infer Q> ? DePromise<Q> : T;

  namespace NodeJS {
    interface ProcessEnv {
      openRouter: string
    }
  }
}


export {};