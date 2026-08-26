import {
  ADDITIONAL_GUIDES,
  INSTALL_RECORDER_AS_NPM_DEPENDENCY_URL,
  ENSURE_RECORDER_CAPTURES_ALL_REQUESTS_URL,
} from "src/lib/utils/internal-urls/docs-urls.utils";

const REQUIREMENTS_TITLE =
  "**Important: The Meticulous Recorder script should be the first script to load, and have no async or defer attributes**";

const NEXTJS_REQUIREMENTS_TITLE =
  "**Important: The Meticulous Recorder script should use the native `script` tag instead of the NextJS `Script` component, be the first script to load, and have no async or defer attributes**";

export const DEFAULT_NOT_POSSIBLE_TO_MEET_REQUIREMENTS_TEXT = `If it's not possible to meet these requirements then you can [use an NPM dependency instead of a script tag](${INSTALL_RECORDER_AS_NPM_DEPENDENCY_URL}). If you need to wait for a network request to complete before you know whether you should record the session then you can [buffer the requests in memory, and only send them later](${ADDITIONAL_GUIDES.CONTROLLING_WHEN_RECORDING_STARTS_AND_STOPS_URL}).`;

export const scriptRequirementsCalloutCard = ({
  isNextJs,
  notPossibleToMeetRequirementsText,
}: {
  isNextJs: "yes" | "no" | "maybe";
  notPossibleToMeetRequirementsText?: string;
}) => `
{% callout_card showIcon=false %}
${isNextJs === "yes" ? NEXTJS_REQUIREMENTS_TITLE : REQUIREMENTS_TITLE}

Libraries you depend on may snapshot references
to \`window.fetch\` or \`window.XMLHttpRequest\` early in the page lifecycle, which means if Meticulous is not the first script to load
it may not be able to record all the network
responses required for your app to function ([learn more](${ENSURE_RECORDER_CAPTURES_ALL_REQUESTS_URL})). Therefore the recorder script
must be the first script to load in order to be guaranteed to capture all network requests correctly. This means:

1. It should be added to your \`index.html\` file, before any other script tags.
2. It should not have any async or defer attributes set${
  isNextJs === "yes"
    ? `, and use the native \`script\` tag instead of the NextJS \`Script\` component`
    : "."
}${
  isNextJs === "maybe"
    ? ` If using NextJS then it should use the native \`script\` tag instead of the NextJS \`Script\` component.`
    : ""
}
3. It should be present in the initial HTML returned from the server -- you cannot add the script tag dynamically using JavaScript, since if
you do so the browser may execute the script after other scripts have loaded. If you need to include the script tag in your HTML only
in certain environments then this must be done either server-side, or at build time by templating your HTML.

${
  notPossibleToMeetRequirementsText ??
  DEFAULT_NOT_POSSIBLE_TO_MEET_REQUIREMENTS_TEXT
}

{% /callout_card %}
`;
