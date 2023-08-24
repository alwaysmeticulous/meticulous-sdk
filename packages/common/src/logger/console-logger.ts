import log from "loglevel";
import { getOrSetWinstonLogger } from "./winston-logger";

export const METICULOUS_LOGGER_NAME = "@alwaysmeticulous";

// TODO: check if code is executing in k8s cloud replay worker
export const MeticulousLogger = process.env.NODE_ENV === "production" ? log : getOrSetWinstonLogger();
