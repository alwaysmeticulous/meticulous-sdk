declare global {
  interface Window {
    __meticulous?: {
      replayDebugger?: {
        puppeteer?: {
          pullState: () => Promise<any>;
        };
      };
    };
  }
}
