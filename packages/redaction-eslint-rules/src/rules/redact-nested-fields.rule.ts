import { ESLintUtils, TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://example.com/eslint/rules/${name}`
);

const messages = {
  missingRedactors: "Missing redactors for fields: {{fields}}",
};

type Options = [];

export const rule = createRule<Options, keyof typeof messages>({
  name: "complete-redactors",
  meta: {
    type: "problem",
    docs: {
      description: "Ensures all required redactors are specified",
      recommended: "error",
    },
    fixable: "code",
    schema: [],
    messages,
  },
  defaultOptions: [],
  create(context) {
    const parserServices = ESLintUtils.getParserServices(context);
    const checker = parserServices.program.getTypeChecker();

    return {
      CallExpression(node) {
        // Check if this is a call to createRedactor
        if (!isCreateRedactorCall(node)) return;

        // Get the first argument (options object)
        const optionsArg = node.arguments[0];
        if (!optionsArg || !ts.isObjectLiteralExpression(optionsArg)) return;

        // Get the strings property
        const stringsProperty = optionsArg.properties.find(
          (prop) =>
            ts.isPropertyAssignment(prop) && prop.name.getText() === "strings"
        );
        if (!stringsProperty || !ts.isPropertyAssignment(stringsProperty))
          return;

        // Get the type parameter (KEY_TYPES)
        const typeParameter = getTypeParameter(node, checker);
        if (!typeParameter) return;

        // Get all required field names from the type
        const requiredFields = getRequiredFieldNames(typeParameter);

        // Get existing field names from the strings object
        const existingFields = getExistingFieldNames(
          stringsProperty.initializer
        );

        // Find missing fields
        const missingFields = requiredFields.filter(
          (field) => !existingFields.includes(field)
        );

        if (missingFields.length === 0) return;

        context.report({
          node: stringsProperty,
          messageId: "missingRedactors",
          data: {
            fields: missingFields.join(", "),
          },
          fix(fixer) {
            const sourceCode = context.getSourceCode();
            const stringsObj = stringsProperty.initializer;

            // If empty object, replace entirely
            if (stringsObj.properties.length === 0) {
              const newRedactors = missingFields
                .map((field) => `${field}: doNotRedact`)
                .join(",\n    ");
              return fixer.replaceText(
                stringsObj,
                `{\n    ${newRedactors}\n  }`
              );
            }

            // Add missing fields to existing object
            const lastProp =
              stringsObj.properties[stringsObj.properties.length - 1];
            const newRedactors = missingFields
              .map((field) => `\n    ${field}: doNotRedact,`)
              .join("");
            return fixer.insertTextAfter(lastProp, newRedactors);
          },
        });
      },
    };
  },
});

// Helper functions
function isCreateRedactorCall(node: TSESTree.CallExpression): boolean {
  return (
    node.callee.type === "MemberExpression" &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "createRedactor"
  );
}

function getTypeParameter(
  node: TSESTree.CallExpression,
  checker: ts.TypeChecker
): ts.Type | undefined {
  const signature = checker.getResolvedSignature(node);
  if (!signature || !signature.typeParameters) return undefined;
  return signature.typeParameters[0];
}

function getRequiredFieldNames(type: ts.Type): string[] {
  if (!type.isUnion()) return [];
  return type.types
    .filter((t) => t.isStringLiteral())
    .map((t) => (t as ts.StringLiteralType).value);
}

function getExistingFieldNames(obj: ts.Expression): string[] {
  if (!ts.isObjectLiteralExpression(obj)) return [];
  return obj.properties
    .filter(ts.isPropertyAssignment)
    .map((prop) => prop.name.getText());
}
