// Expo/React Native app. Deliberately not `eslint-config-expo`: that preset still
// references rules removed in @typescript-eslint v8, which is the version the rest
// of this workspace uses. Same base rules plus React and hooks.
module.exports = {
  extends: [
    require.resolve("./base.js"),
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
  ],
  parserOptions: { ecmaFeatures: { jsx: true } },
  env: { browser: true, node: true },
  settings: { react: { version: "detect" } },
  rules: {
    // React Native has no HTML entities to escape, and the JSX transform makes
    // the `React` import unnecessary.
    "react/no-unescaped-entities": "off",
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
  },
};
