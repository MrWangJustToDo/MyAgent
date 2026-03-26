declare global {
  type DePromise<T> = T extends Promise<infer Q> ? DePromise<Q> : T;
  type SplitUndefined<T> = T extends undefined ? never : T;

  namespace NodeJS {
    interface ProcessEnv {
      provider: "ollama" | 'openRouter';
      apiKey: string
      model: string;
      DEV: string
    }
  }
}


export {};