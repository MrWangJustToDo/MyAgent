declare global {
  type DePromise<T> = T extends Promise<infer Q> ? DePromise<Q> : T;
  type Split<T, F> = T extends F ? never : T;

  namespace NodeJS {
    interface ProcessEnv {
      MODEL_STYLE: "openai" | "anthropic";
      STYLE: "openai" | "anthropic";
      MODEL: string;
      BASE_URL: string;
      MODEL_BASE_URL: string;
      API_KEY: string;
      NODE_ENV: "development" | "production";
    }
  }
}

export {};
