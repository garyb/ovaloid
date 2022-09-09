module.exports = {
  root: true,
  "parser": "@typescript-eslint/parser",
  "plugins": [
    "@typescript-eslint"
  ],
  "env": {
    "node": true,
    "commonjs": true,
    "es2022": true
  },
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "semi": "off",
    "@typescript-eslint/semi": "warn",
    "comma-dangle": "off",
    "@typescript-eslint/comma-dangle": ["warn", "always-multiline"],
    "@typescript-eslint/member-delimiter-style": ["warn", {
      multiline: {
        delimiter: "none",
        requireLast: false,
      },
      singleline: {
        delimiter: "comma",
        requireLast: false,
      },
    }],
  },
};
