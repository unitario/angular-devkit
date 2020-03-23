import { BuilderContext, BuilderOutput } from '@angular-devkit/architect'
import { JsonObject } from '@angular-devkit/core'
import { cyan, dim } from 'chalk'
import * as cluster from 'cluster'
import ora from 'ora'
import { is } from 'ramda'
import { from, Observable, of, OperatorFunction, ReplaySubject, Subscription } from 'rxjs'
import { catchError, finalize, first, map, pluck, switchMap } from 'rxjs/operators'

import { IS_SINGLE_CPU } from '../index'

/**
 * The global base configuration interface as shared by all builders in the application
 */
export interface Options extends JsonObject {
  /** Name of the project this build is targeting */
  project: string
  /** Run build and output a detailed record of the child tasks console logs. Default is `false`. */
  verbose: boolean
}

/**
 * The builder context interface as passed through the chain of builder tasks provided to the `builderHandler`
 */
export interface Context {
  /** The assigned values of the global options, target options and user provided options. */
  options: Options & JsonObject
  /** The builder context */
  context: BuilderContext
  /** The target project metadata (as specified in the workspace `angular.json` configuration file) */
  metadata: JsonObject
  /** The builder output from the last completed builder task/-s */
  output?: BuilderOutput
}

/**
 * A builder callback function, may return an object, promise or observable. Unhandled exzceptions will be resolved into a `BuilderOutput` object.
 */
export type BuilderCallback = (context: Context) => BuilderOutput | Promise<BuilderOutput> | Observable<BuilderOutput>

/**
 * Builders provided to `builderHandler`
 */
export type Builders = OperatorFunction<Context, Context>[]

/**
 * Takes a list of builder tasks, executes them in sequence and returns a `BuilderOutput` observable. The builder output will only return `success: true` if all tasks has resolved without error.
 * @param builderMessage Message to print when the builder is initialized
 * @param builders List of build tasks to be executed in this builder context
 */
export const builderHandler = (builderMessage: string, builders: Builders) => {
  return (options: Options, context: BuilderContext): Observable<BuilderOutput> => {
    if (IS_SINGLE_CPU) {
      context.logger.info(`Builder is running on a single-core processing unit. Switching to single-threaded mode.`)
    }
    const project = context.target && context.target.project
    if (!project) {
      context.logger.fatal(`The builder '${context.builder.builderName}' could not execute. No project was found.`)
    }
    const projectMetadata = context.getProjectMetadata(project)
    const assignContext = map(
      (metadata: JsonObject) =>
        ({
          project,
          options: { ...options, ...{ verbose: IS_SINGLE_CPU ? true : options.verbose } },
          context,
          metadata,
        } as Context)
    )
    // Clear console from previous build
    // eslint-disable-next-line no-console
    console.clear()
    // Logs initializaton message
    context.logger.info(`\n${builderMessage} ${cyan(project)} \n`)

    const initializer = from(projectMetadata)
      // Initialize the builder
      .pipe(first(), assignContext)

    // eslint-disable-next-line prefer-spread
    const proccesser = initializer.pipe.apply(initializer, builders).pipe(
      pluck<Context, BuilderOutput>('output'),
      map<BuilderOutput, BuilderOutput>(({ success, error }) => {
        if (success) context.logger.info(dim(`\nCompleted successfully.\n`))
        else {
          context.logger.info(dim(`\nCompleted with error.\n`))
        }
        return { success, error }
      })
    ) as Observable<BuilderOutput>

    return proccesser
  }
}

/**
 * Shedules a build run for a specific builder target, logs the process of that build and returns an observable function which wraps a `Context` object
 * @param builderMessage Message to print when the builder is either initalized or completed
 * @param builder The name of a builder, i.e. its `package:builderName` tuple, or a builder callback function
 * @param builderOptions Additional options passed to the builder
 */
export const scheduleBuilder = (
  builderMessage: string,
  builder: string | BuilderCallback,
  builderOptions?: JsonObject
): OperatorFunction<Context, Context> => {
  return switchMap((context: Context) => {
    const loader = ora({ indent: 2 })
    const builderOutput$: ReplaySubject<BuilderOutput> = new ReplaySubject()

    /**
     * Transforms `BuilderOutput` to `Context` object
     * @param builderOutput `BuilderOutput` object
     */
    const toContext = map(
      ({ success, error }: BuilderOutput) =>
        ({
          ...context,
          output: {
            // Only failed outcomes should persist
            success: success === false ? false : context.output.success,
            error,
          } as BuilderOutput,
        } as Context)
    )

    /**
     * Initialize a new loading state for the worker
     */
    const onOnline = (): void => {
      if (cluster.isMaster) {
        // Close all running processes on hot reloads
        Object.keys(cluster.workers).forEach((index: string) => {
          if (cluster.workers[index].isConnected()) {
            loader.info(`Builder ${builderMessage} terminated`)
            cluster.workers[index].disconnect()
          }
        })
        loader.start(`Building ${builderMessage}`)
      }
    }

    /**
     * Sets the `BuilderOutput` state. Runs every time the cluster master receives a message from its worker.
     * @param builderOutput `BuilderOutput` object
     */
    const onWorkerMessage = ({ success, error }: BuilderOutput): void => {
      if (success) {
        loader.succeed()
      }
      builderOutput$.next({ success, error })
    }

    /**
     * Handles errors gracefully when a worker process has failed
     * @param error `Error` object
     */
    const onWorkerError = ({ message }: Error): void => {
      builderOutput$.next({
        success: false,
        error:
          // prettier-ignore
          `Worker process for ${context.context.builder.builderName} failed with an exception.\n\n` +
          `The reason for this is due to one of the following reasons:\n\n` +
          `  1. The worker could not be spawned, or\n` + 
          `  2. The worker could not be killed, or\n` +
          `  3. The worker were unable to send a message to the master.\n\n` +
          `Error message: ${message}`,
      })
      builderOutput$.complete()
    }

    /**
     * Exists process when a worker was killed or exited
     * @param worker `Worker` object
     * @param code Exit code
     * @param signal Exit signal
     */
    const onWorkerExit = (_worker: cluster.Worker, code: number, signal: string): void => {
      if (code) {
        builderOutput$.next({
          success: false,
          error:
            // prettier-ignore
            `Worker process for ${context.context.builder.builderName} failed with an exception.\n\n` +
            `Process failed with exit code '${code}' and signal '${signal}'`,
        })
      }
      builderOutput$.complete()
    }

    /**
     * Executes when the builder is an observable and that observable has emitted a new value. Will only be called when the builder is in watch mode.
     * @param builderOutput Builder output object
     */
    const onBuilderCallbackNext = ({ success, error }: BuilderOutput): void => {
      if (cluster.isWorker) {
        if (process.send) {
          process.send({ success, error })
        }
      }
    }

    /**
     * Executes when the builder's callback either has:
     * 1. Returned a observable which has completed with an error, or
     * 2. Returned a promise which has rejected, or
     * 3. Thrown an error
     * @param error Error message or object
     */
    const onBuilderCallbackError = (error: string): Observable<BuilderOutput> => {
      if (cluster.isWorker) {
        if (process.send) {
          process.send({ success: false, error })
        }
      }
      return of({ success: false, error }) as Observable<BuilderOutput>
    }

    /**
     * Executes when the builder's callback either has:
     * 1. Returned a observable which has completed without error, or
     * 2. Returned a promise which has resolved, or
     * 3. Returned a value
     */
    const onBuilderCallbackComplete = (): void => {
      if (cluster.isWorker) {
        if (process.send) {
          process.send({ success: true })
        }
      }
    }

    /**
     * Returns a builder callback as observable
     */
    const getBuilderCallback = (): Observable<BuilderOutput> => {
      let builderCallback: Observable<BuilderOutput>
      if (is(String, builder)) {
        builderCallback = from(context.context.scheduleBuilder(builder as string, { ...context.options, ...{ builderOptions } })).pipe(
          switchMap((builderRun) => builderRun.output)
        )
      }
      if (is(Function, builder)) {
        const builderCallbackFn = (builder as BuilderCallback)(context)
        if (is(Promise, builderCallbackFn)) builderCallback = from(builderCallbackFn as Promise<BuilderOutput>)
        if (is(Object, builderCallbackFn)) builderCallback = of(builderCallbackFn as BuilderOutput)
        builderCallback = (builderCallbackFn as Observable<BuilderOutput>).pipe(catchError(onBuilderCallbackError))
      }
      return builderCallback
    }

    if (context.options.verbose) {
      // Verbose output will execute on a single thread
      return getBuilderCallback().pipe(toContext)
    }
    if (cluster.isMaster) {
      // Do not pipe the worker's stdout or stderr
      cluster.setupMaster({ silent: true })
      cluster
        .fork()
        // When the worker has been connected to master
        .on('online', onOnline)
        // When the worker emits a message
        .on('message', onWorkerMessage)
        // When the worker has thrown a critical error
        .on('error', onWorkerError)
        // When the worker has been either exited or killed
        .on('exit', onWorkerExit)
    } else {
      const subscription: Subscription = getBuilderCallback()
        .pipe(finalize(() => subscription.unsubscribe()))
        .subscribe(onBuilderCallbackNext, onBuilderCallbackError, onBuilderCallbackComplete)
    }

    return builderOutput$.asObservable().pipe(toContext)
  })
}
