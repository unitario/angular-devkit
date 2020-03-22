# Unitario Angular Devkit

This package is a utility library for setting up, configuring and deploying Angular applications.

Its goal is to provide a rich set of tools to enchance the development experience when working with the framework.

## Installation

```
npm install @unitario/angular-devkit --save-dev
```

## Tools

### Builders

Builders allows you to develop [Angular Builders](https://angular.io/guide/cli-builder) with a streamlined interface. It aims to make the process of developing builders easier and 

#### What it does

* Simplyfies the process for developing Angular builders
* Allows you to pipe multiple builders in a single sequence
* Minimizes your consoel logs (only logs what's important)

#### Usage

```typescript
import {
  BuilderOutput,
  createBuilder
} from "@angular-devkit/architect";

import {
  builderHandler,
  scheduleBuilder,
  when,
  Options,
  Context 
} from "@unitario/angular-devkit";

interface UserOptions extends Options {
  errorOnDepreciated: boolean;
}

const isLibrary = ({ metadata }: Context) => metadata.projectType === "library";

export default const createHandler<Options>(
  "Building",
  [
    // Builder referenced by package 
    scheduleBuilder("@angular-eslint/builder:lint", "Linting"),
    // Builder with options
    scheduleBuilder("@angular-builders/jest:run", "Testing", { errorOnDepreciated }),
    // Builder with callback
    scheduleBuilder(({ options, context, metadata }) => {
      // Return promise, observable or value
      return new Promise((resolve, reject) => {
        // Errors will be automatically resolved
        return reject("Show this error in console");
      })
    })
    // Builder based on predicate
    when(isLibrary,
      scheduleBuilder("@angular-devkit/build-ng-packagr:build", "Building")
    ),
  ]
);

export default const createBuilder<Options>(builderHandler);
```

#### Console Output