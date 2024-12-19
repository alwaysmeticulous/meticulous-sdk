# `eslint-plugin-redaction`

## Experimental: This plugin is experimental and may be removed in future.

Auto-generates a default config for your .createRedactor() calls.

This rule requires type information: when using please ensure that parserOptions.projectService is set to true in your eslint config,
and you've set your tsconfigRootDir to the root of your project.

```js
// eslint.config.js
import eslint from '@eslint/js';
import redactRequiredFields from 'eslint-plugin-redaction'
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ["lib"] },
    eslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    redactRequiredFields.configs.recommended // 👈
    {
        languageOptions: {
            parserOptions: {
                projectService:true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
);
```
