module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es6: true,
    node: true,
  },
  extends: "eslint:recommended",
  ignorePatterns: ["dist/"],
  globals: {
    Atomics: "readonly",
    SharedArrayBuffer: "readonly",
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
  overrides: [
    {
      files: ["test/**/*.js"],
      env: { mocha: true },
    },
  ],
  rules: {},
};
