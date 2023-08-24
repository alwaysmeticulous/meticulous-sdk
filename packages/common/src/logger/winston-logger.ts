import { LogLevel, LogLevelDesc, Logger, MethodFactory, RootLogger } from "loglevel";

let winstonLogger: WinstonLogger | undefined;

// Manually initialize the winston logger the first time it is needed.
export function getOrSetWinstonLogger(): WinstonLogger {
    if (winstonLogger === undefined) {
        winstonLogger = new WinstonLogger();
    }
    return winstonLogger;
}

export class WinstonLogger implements RootLogger {
    noConflict() {
        throw new Error("Method not implemented.");
    }
    getLogger(name: string | symbol): Logger {
        throw new Error("getLogger method not implemented for WinstonLogger.");
    }
    getLoggers(): { [name: string]: Logger; } {
        throw new Error("Method not implemented.");
    }
    
    // TODO: figure out how to implement this without definite assignment assertions
    default!: RootLogger;
    levels!: LogLevel;
    methodFactory!: MethodFactory;

    trace(...msg: any[]): void {
        throw new Error("Method not implemented.");
    }
    debug(...msg: any[]): void {
        throw new Error("Method not implemented.");
    }
    log(...msg: any[]): void {
        throw new Error("Method not implemented.");
    }
    info(...msg: any[]): void {
        throw new Error("Method not implemented.");
    }
    warn(...msg: any[]): void {
        throw new Error("Method not implemented.");
    }
    error(...msg: any[]): void {
        throw new Error("Method not implemented.");
    }
    setLevel(level: LogLevelDesc, persist?: boolean | undefined): void {
        throw new Error("Method not implemented.");
    }
    getLevel(): 0 | 2 | 1 | 3 | 4 | 5 {
        throw new Error("Method not implemented.");
    }
    setDefaultLevel(level: LogLevelDesc): void {
        throw new Error("Method not implemented.");
    }
    resetLevel(): void {
        throw new Error("Method not implemented.");
    }
    enableAll(persist?: boolean | undefined): void {
        throw new Error("Method not implemented.");
    }
    disableAll(persist?: boolean | undefined): void {
        throw new Error("Method not implemented.");
    }
}