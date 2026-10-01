import babel from "prettier/plugins/babel";
import estree from "prettier/plugins/estree";
import postcss from "prettier/plugins/postcss";
import { format as prettierFormat, type Options } from "prettier/standalone";

const plugins = [babel, estree, postcss];

export const format = (source: string, options: Options): Promise<string> =>
  prettierFormat(source, { ...options, plugins });
