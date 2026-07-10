declare global {
  type DePromise<T> = T extends Promise<infer Q> ? DePromise<Q> : T;
  type SplitUndefined<T> = T extends undefined ? never : T;

  namespace NodeJS {
    interface ProcessEnv {
      MODEL_STYLE: "openai" | "anthropic";
      STYLE: "openai" | "anthropic";
      MODEL: string;
      BASE_URL: string;
      MODEL_BASE_URL: string;
      API_KEY: string;
      DEV: string;
    }
  }
}

export {};
