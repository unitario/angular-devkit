module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/builders/**/*.spec.ts'],
  transform: {
    '^.+\\.(ts)$': 'ts-jest',
  },
}
