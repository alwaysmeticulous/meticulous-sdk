import {
  RECORDER_CSP_EXCEPTIONS_URL,
  TROUBLESHOOT_RECORDER_URL,
} from "src/lib/utils/internal-urls/docs-urls.utils";

export const STEPS_AFTER_INSTALLING_RECORDER = `
## Validating installation

Once you add the Meticulous snippet, open your webapp (either locally or on the environment that you injected the snippet into) and record a session by clicking around on your web app.

If the snippet was installed successfully you should be able to view the recorded session in your
{% project_link %}Meticulous dashboard {% /project_link %} in the **Sessions** section.

If you set a CSP policy on your application then you'll need to add [these](${RECORDER_CSP_EXCEPTIONS_URL}) CSP exceptions.

## I've installed the snippet but why do I not see any sessions in my Meticulous dashboard?

See [troubleshooting](${TROUBLESHOOT_RECORDER_URL}) for more information on why this might be happening.

## Issues / questions?

We're always happy to help you with any issues you encounter while setting up or anything you might be unsure about.

Get in touch by emailing [support@meticulous.ai](mailto:support@meticulous.ai).
`;
