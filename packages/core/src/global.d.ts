declare global {
  type DePromise<T> = T extends Promise<infer Q> ? DePromise<Q> : T;
  type Split<T, F> = T extends F ? never : T;

  namespace NodeJS {
    interface ProcessEnv {
      provider: "ollama" | 'openRouter';
      apiKey: string
      model: string;
    }
  }
}


export {};