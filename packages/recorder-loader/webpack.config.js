const path = require("path");
const srcDir = "./src/";
const distDir = "./dist/";

const config = {
  target: "web",
  entry: {
    index: path.join(__dirname, srcDir, "index.ts"),
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        include: path.resolve(__dirname, srcDir),
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
    symlinks: false,
  },
  output: {
    path: path.resolve(__dirname, distDir),
    filename: "[name].js",
    library: {
      name: "MeticulousRecoderLoader",
      type: "umd",
      umdNamedDefine: true,
    },
  },
};

module.exports = [config];
