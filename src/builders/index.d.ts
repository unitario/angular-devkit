import { BuilderContext, BuilderOutput } from '@angular-devkit/architect';
import { JsonObject } from '@angular-devkit/core';
import { Observable, OperatorFunction } from 'rxjs';
/**
 * The global base configuration interface as shared by all builders in the application
 */
export interface Options extends JsonObject {
    /** Name of the project this build is targeting */
    project: string;
    /** Run build and output a detailed record of the child tasks console logs. Default is `false`. */
    verbose: boolean;
}
/**
 * The builder context interface as passed through the chain of builder tasks provided to the `builderHandler`
 */
export interface Context {
    /** The assigned values of the global options, target options and user provided options. */
    options: Options & JsonObject;
    /** The builder context */
    context: BuilderContext;
    /** The target project metadata (as specified in the workspace `angular.json` configuration file) */
    metadata: JsonObject;
    /** The builder output from the last completed builder task/-s */
    output?: BuilderOutput;
}
/**
 * A builder callback function, may return an object, promise or observable. Unhandled exzceptions will be resolved into a `BuilderOutput` object.
 */
export declare type BuilderCallback = (context: Context) => BuilderOutput | Promise<BuilderOutput> | Observable<BuilderOutput>;
/**
 * Builders provided to `builderHandler`
 */
export declare type Builders = OperatorFunction<Context, Context>[];
/**
 * Takes a list of builder tasks, executes them in sequence and returns a `BuilderOutput` observable. The builder output will only return `success: true` if all tasks has resolved without error.
 * @param builderMessage Message to print when the builder is initialized
 * @param builders List of build tasks to be executed in this builder context
 */
export declare const builderHandler: (builderMessage: string, builders: Builders) => (options: Options, context: BuilderContext) => Observable<BuilderOutput>;
/**
 * Shedules a build run for a specific builder target, logs the process of that build and returns an observable function which wraps a `Context` object
 * @param builderMessage Message to print when the builder is either initalized or completed
 * @param builder The name of a builder, i.e. its `package:builderName` tuple, or a builder callback function
 * @param builderOptions Additional options passed to the builder
 */
export declare const scheduleBuilder: (builderMessage: string, builder: string | BuilderCallback, builderOptions?: JsonObject) => OperatorFunction<Context, Context>;
