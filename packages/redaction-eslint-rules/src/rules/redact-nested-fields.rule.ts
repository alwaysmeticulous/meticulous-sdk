import {
  ESLintUtils,
  ParserServices,
  TSESTree,
} from "@typescript-eslint/utils";
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
          return;
        }
        if (node.callee.property.type !== TSESTree.AST_NODE_TYPES.Identifier) {
          return;
        }

        const propertyName = node.callee.property.name;
        if (propertyName !== "createRedactor") {
          return;
        }

        // For a specific node/file
        const sourceFile = parserServices.program.getSourceFile(
          context.getFilename()
        );
        const fileSpecificDiagnostics =
          parserServices.program.getSemanticDiagnostics(sourceFile);

        const hasMissingPropertyError = fileSpecificDiagnostics.filter((e) =>
          e.messageText.toString().match(/Property '.+' is missing in type/)
        );
        if (hasMissingPropertyError.length === 0) {
          return;
        }

        const stringsProperty = getStringsProperty(node);
        if (!stringsProperty) {
          return;
        }

        const actualKeys = getFieldsWithRedactionPolicies(stringsProperty);

        const paramType = getFirstParamType(
          parserServices,
          node.callee.property,
          checker
        );
        if (!paramType) {
          return;
        }
        const expectedKeys = getFieldsThatRequireRedactionPolicies(
          paramType,
          checker
        );
        const actualKeysSet = new Set(actualKeys);
        const missingKeys = expectedKeys.filter(
          (key) => !actualKeysSet.has(key)
        );

        if (missingKeys.length === 0) {
          return;
        }

        context.report({
          node: stringsProperty,
          messageId: "missingRedactors",
          data: {
            fields: missingKeys,
          },
          fix(fixer) {
            const stringsObject =
              stringsProperty.value as TSESTree.ObjectExpression;
            const lastProperty =
              stringsObject.properties[stringsObject.properties.length - 1];

            if (!lastProperty) {
              // If there are no properties, insert inside the braces
              return fixer.insertTextAfter(
                stringsObject.properties[0] || stringsObject,
                `\n    ${missingKeys
                  .map((field) => `${field}: doNotRedact`)
                  .join(",\n    ")}\n  `
              );
            }

            return fixer.insertTextAfter(
              lastProperty,
              `,\n    ${missingKeys
                .map((field) => `${field}: doNotRedact`)
                .join(",\n    ")}`
            );
          },
        });
      },
    };
  },
});

function getStringsProperty(node: TSESTree.CallExpression) {
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
}

function getFieldsWithRedactionPolicies(
  stringsProperty: TSESTree.Property
): string[] {
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
      .filter((key): key is string => key !== null);
  }

  return [];
}

function getFieldsThatRequireRedactionPolicies(
  type: ts.Type,
  checker: ts.TypeChecker
): string[] {
  // For Record<K,V>, we need to get the type reference
  const stringsSymbol = type.getProperty("strings");
  if (!stringsSymbol) {
    return [];
  }

  if (!stringsSymbol.valueDeclaration) {
    return [];
  }

  const stringsType = checker.getTypeOfSymbolAtLocation(
    stringsSymbol,
    stringsSymbol.valueDeclaration
  );

  const normalizedType = checker.typeToString(
    stringsType!,
    undefined, // enclosingDeclaration
    ts.TypeFormatFlags.NoTruncation |
      ts.TypeFormatFlags.NoTypeReduction |
      ts.TypeFormatFlags.InTypeAlias
  );

  return normalizedType
    .replace(/[{}]/g, "")
    .split(";")
    .map((prop) => prop.trim())
    .filter(Boolean)
    .map((prop) => prop.split(":")[0].trim());
}

function getFirstParamType(
  parserServices: ParserServices,
  node: TSESTree.Expression,
  checker: ts.TypeChecker
) {
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
}
