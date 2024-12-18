export const redactEmail = (email: string) => {
  return email
    .split("@")
    .map((str) =>
      str
        .split(".")
        .map((subStr) => redactComponent(subStr))
        .join(".")
    )
    .join("@");
};

const redactComponent = (component: string) => {
  if (["com", "net", "org", "io", "ai"].includes(component)) {
    return component;
  }
  // We repeat the string "redacted", since asterixes may not work with all parsers
  // redacted___@redac.red
  return component.replace(/./g, "-");
};
