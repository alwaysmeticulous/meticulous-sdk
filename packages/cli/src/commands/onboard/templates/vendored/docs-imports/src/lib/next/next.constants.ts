import { toBool } from "../utils/env.utils";

export const IS_SSR = typeof window === "undefined";

export const IS_METICULOUS_ENABLED = toBool(
  process.env.NEXT_PUBLIC_ENABLE_METICULOUS || "1",
);

/** We set this to true only when automatically generating full stack test coverage. It is not set to true otherwise. */
export const IS_METICULOUS_FULL_STACK_TEST_RECORDING_ENABLED = toBool(
  process.env.ENABLE_METICULOUS_FULL_STACK_TEST_RECORDING ||
    process.env.NEXT_PUBLIC_ENABLE_METICULOUS_FULL_STACK_TEST_RECORDING ||
    "0",
);

export const IS_PRODUCTION =
  process.env.NEXT_PUBLIC_ENVIRONMENT === "production";

export const IS_SEGMENT_ANALYTICS_ENABLED = toBool(
  process.env.ENABLE_SEGMENT_ANALYTICS ||
    process.env.NEXT_PUBLIC_ENABLE_SEGMENT_ANALYTICS ||
    "0",
);

export const METICULOUS_SUPPORT_EMAIL = "support@meticulous.ai";

export const METICULOUS_SETUP_CALENDLY_LINK =
  "https://calendly.com/gabriel-h/meticulous-demo-booking";

export const METICULOUS_BACKEND_SETUP_CALENDLY_LINK =
  "https://calendly.com/denis-meticulous/30min";

export const SEGMENT_TOKEN = process.env.NEXT_PUBLIC_SEGMENT_TOKEN;

export const VERCEL_METICULOUS_INTEGRATION_URL =
  process.env.NEXT_PUBLIC_VERCEL_METICULOUS_INTEGRATION_URL ??
  "https://vercel.com/integrations/meticulous";

export const IS_MOCK_USER_SWITCHER_ENABLED = toBool(
  process.env.NEXT_PUBLIC_ENABLE_MOCK_USER_SWITCHER || "0",
);
