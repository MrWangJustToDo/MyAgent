declare global {
  type DePromise<T> = T extends Promise<infer Q> ? DePromise<Q> : T;
  type SplitUndefined<T> = T extends undefined ? never : T;

  namespace NodeJS {
    interface ProcessEnv {
      PROVIDER: "ollama" | "openRouter";
      API_KEY: string;
      MODEL: string;
      DEV: string;
    }
  }
}


export {};