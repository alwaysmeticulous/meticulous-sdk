export const jevActionSelectionPrompts = {
  operation: {
    instructions:
      "Explore the application by choosing the action most likely to reach a new screen or reveal a distinct UI state that has not been seen yet. Use the recent action history to avoid repetition. Avoid destructive actions, sign out, payments, sending messages, and repeated list items.",
    criteria: {
      CLICK_ON_PAGE:
        "Click a control that is likely to reveal a new screen or distinct UI state, such as a feature, form, tab, menu, or modal.",
      FOLLOW_LINK:
        "Follow an internal link that is likely to reach a new screen or distinct product area that has not been explored.",
      MOVE_ON:
        "Stop exploring this page because the remaining actions are repetitive, low-value, or risky.",
    },
  },
  clickTarget: {
    instructions:
      "If clicking is selected, choose the candidate most likely to reveal a new screen or distinct UI state.",
  },
  linkTarget: {
    instructions:
      "If following a link is selected, choose the link most likely to reach a new screen or distinct product area.",
  },
  risky: {
    instructions:
      "Would activating this control delete or irreversibly change data, sign out, submit a payment, or send a message?",
    criteria: {
      true: "The action is destructive, irreversible, or communicates externally.",
      false:
        "The action is safe exploration, navigation, or a reversible UI change.",
    },
  },
} as const;
