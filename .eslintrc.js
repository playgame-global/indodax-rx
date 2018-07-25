module.exports = {
  "env": {
    "es6": true,
    "node": true,
    "mocha": true
  },
  "extends": [
    "eslint:recommended",
    "airbnb-base"
  ],
  "parserOptions": {
    "sourceType": "module"
  },
  "rules": {
    "indent": [
      "error",
      2
    ],
    "linebreak-style": [
      "error",
      "unix"
    ],
    "quotes": [
      "error",
      "single"
    ],
    "semi": [
      "error",
      "never"
    ],
    "arrow-body-style": [
      "off"
    ],
    "no-underscore-dangle": [
      "off"
    ],
    "no-mixed-operators": [
      "off"
    ]
  }
};