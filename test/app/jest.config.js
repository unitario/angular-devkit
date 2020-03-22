module.exports = {
  preset: "jest-preset-angular",
  setupFilesAfterEnv: "<rootDir>/jest.setup.ts",
  roots: ["<rootDir>/src"],
  transform: {
    "^.+\\.(ts|js|html)$": "ts-jest",
  },
  moduleNameMapper: {
    "^@vattenfall/ui(.*)$": "<rootDir>/dist/ui/$1",
  },
  testMatch: ["<rootDir>/src/**/*.spec.ts"],
  snapshotResolver: "./jest.snapshotResolver.js",
};
