declare module "screenshot-desktop" {
  interface ScreenshotOptions {
    format?: "png" | "jpg";
    screen?: number;
    filename?: string;
  }

  interface Display {
    id: number;
    name: string;
  }

  function screenshot(options?: ScreenshotOptions): Promise<Buffer>;

  namespace screenshot {
    function listDisplays(): Promise<Display[]>;
    function all(): Promise<Buffer[]>;
  }

  export = screenshot;
}
