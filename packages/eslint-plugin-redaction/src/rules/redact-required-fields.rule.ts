import {
  ESLintUtils,
  ParserServices,
  ParserServicesWithTypeInformation,
  TSESTree,
} from "@typescript-eslint/utils";
import { RuleContext, RuleFix } from "@typescript-eslint/utils/ts-eslint";
import ts from "typescript";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://example.com/eslint/rules/${name}`
);

const messages = {
  missingRedactors: "Missing redactors for fields: {{fields}}",
};

type Options = [];

const APPLICABLE_PROPERTY_NAMES = [
  "createRedactor",
  "createRedactorLax",
  "createRedactorStrict",
];

export const rule = createRule<Options, keyof typeof messages>({
  name: "redact-required-fields",
  meta: {
    type: "problem",
    docs: {
      description: "Ensures all required redactors are specified",
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
        if (node.callee.type !== TSESTree.AST_NODE_TYPES.MemberExpression) {
          return [];
        }
        if (node.callee.property.type !== TSESTree.AST_NODE_TYPES.Identifier) {
          return [];
        }

        const propertyName = node.callee.property.name;
        if (!APPLICABLE_PROPERTY_NAMES.includes(propertyName)) {
          return [];
        }

        const stringsProperty = getStringsProperty(node);
        if (!stringsProperty) {
          return [];
        }

        const methodProperty = node.callee.property;
        const missingFields = getMissingFields(
          methodProperty,
          stringsProperty,
          parserServices,
          checker,
          context
        );

        if (missingFields.length === 0) {
          return;
        }

        context.report({
          node: stringsProperty,
          messageId: "missingRedactors",
          data: {
            fields: missingFields,
          },
          fix(fixer) {
            const fixes: RuleFix[] = [];
            const stringsObject =
              stringsProperty.value as TSESTree.ObjectExpression;
            const lastProperty =
              stringsObject.properties[stringsObject.properties.length - 1];

            if (!lastProperty) {
              // If there are no properties, insert inside the braces
              fixes.push(
                fixer.insertTextAfter(
                  stringsObject.properties[0] || stringsObject,
                  `\n    ${missingFields
                    .map((field) => `${field}: doNotRedact`)
                    .join(",\n    ")}\n  `
                )
              );
            } else {
              fixes.push(
                fixer.insertTextAfter(
                  lastProperty,
                  `,\n    ${missingFields
                    .map((field) => `${field}: doNotRedact`)
                    .join(",\n    ")}`
                )
              );
            }
            return fixes;
          },
        });
      },
    };
  },
});

const getMissingFields = (
  methodProperty: TSESTree.Identifier,
  stringsProperty: TSESTree.Property,
  parserServices: ParserServicesWithTypeInformation,
  checker: ts.TypeChecker,
  context: Readonly<RuleContext<"missingRedactors", []>>
) => {
  const fieldsForWhichPoliciesAlreadySpecified =
    getFieldsWithRedactionPolicies(stringsProperty);

  const paramType = getTypeOfFirstMethodParameter(
    parserServices,
    methodProperty,
    checker
  );
  if (!paramType) {
    return [];
  }
  const requiredFields = getAllRequiredProperties(
    parserServices,
    context.filename
  );
  const alreadyRedactedFieldsSet = new Set(
    fieldsForWhichPoliciesAlreadySpecified
  );
  const missingFields = requiredFields.filter(
    (key) => !alreadyRedactedFieldsSet.has(key)
  );

  return missingFields;
};

const getStringsProperty = (node: TSESTree.CallExpression) => {
  // Get the args from the call expression
  const [firstArg] = node.arguments;

  if (firstArg?.type === TSESTree.AST_NODE_TYPES.ObjectExpression) {
    // Get the 'strings' property
    const stringsProperty = firstArg.properties.find(
      (prop): prop is TSESTree.Property =>
        prop.type === "Property" &&
        "name" in prop.key &&
        prop.key.name === "strings"
    );

    if (
      stringsProperty?.type === "Property" &&
      stringsProperty.value.type === "ObjectExpression"
    ) {
      return stringsProperty;
    }
  }

  return null;
};

const getFieldsWithRedactionPolicies = (
  stringsProperty: TSESTree.Property
): string[] => {
  if (
    stringsProperty?.type === "Property" &&
    stringsProperty.value.type === "ObjectExpression"
  ) {
    // Extract keys from the strings object
    return stringsProperty.value.properties
      .map((prop) => {
        if (prop.type === "Property" && "name" in prop.key) {
          return prop.key.name;
        }
        return null;
      })
      .filter((key): key is string => key != null);
  }

  return [];
};

const getTypeOfFirstMethodParameter = (
  parserServices: ParserServices,
  node: TSESTree.Expression,
  checker: ts.TypeChecker
) => {
  const calleeType = checker.getTypeAtLocation(
    parserServices.esTreeNodeToTSNodeMap.get(node)
  );

  // Get the declaration
  const symbol = calleeType.getSymbol();
  if (symbol) {
    const decl = symbol.declarations?.[0];
    if (decl && ts.isMethodDeclaration(decl)) {
      const methodParams = decl.parameters;
      // Get type of first parameter
      if (methodParams.length > 0) {
        return checker.getTypeAtLocation(methodParams[0]);
      }
    }
  }
};

const getAllRequiredProperties = (
  parserServices: ParserServicesWithTypeInformation,
  filename: string
): string[] => {
  const errors = getMissingPropertyErrors(parserServices, filename);
  console.log("errors", errors);
  const requiredFields = errors.flatMap((error) =>
    [...error.matchAll(/ ([a-zA-Z_\-0-9]+):/g)].map((match) => match[1])
  );
  console.log("requiredFields", requiredFields);
  return requiredFields;
};

const getMissingPropertyErrors = (
  parserServices: ParserServicesWithTypeInformation,
  filename: string
): string[] => {
  const sourceFile = parserServices.program.getSourceFile(filename);
  const fileSpecificDiagnostics =
    parserServices.program.getSemanticDiagnostics(sourceFile);

  const allMessages = (
    diagnostic: ts.Diagnostic | ts.DiagnosticMessageChain
  ): string[] => {
    if (typeof diagnostic.messageText === "string") {
      return [diagnostic.messageText];
    } else {
      return [
        diagnostic.messageText.messageText,
        ...(diagnostic.messageText.next ?? []).flatMap(allMessages),
      ];
    }
  };
  const messages = fileSpecificDiagnostics.flatMap(allMessages);

  return messages.filter((msg) =>
    msg.match(/Property '.+' is missing in type/)
  );
};
