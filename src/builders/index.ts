import { BuilderContext, BuilderOutput, ScheduleOptions } from '@angular-devkit/architect'
import { JsonObject } from '@angular-devkit/core'
import { bgGreen, bgRed, cyan, dim, inverse } from 'chalk'
import * as cluster from 'cluster'
import ora from 'ora'
import { is } from 'ramda'
import { from, isObservable, Observable, of, OperatorFunction, ReplaySubject } from 'rxjs'
import { pipeFromArray } from 'rxjs/internal/util/pipe'
import { concatMap, finalize, first, last, map, pluck, switchMap, takeUntil, tap } from 'rxjs/operators'

import { finalizeWithValue, IS_SINGLE_CPU, toError } from '../index'

/**
 * The global base configuration interface as shared by all builders in the application
 */
export interface Options extends JsonObject {
  /** Run build and output a detailed record of the child tasks console logs. Default is `false`. */
  verbose: boolean
}

/**
 * The builder context interface as passed through the chain of builder tasks provided to the `builderHandler`
 */
export interface Context {
  /** Name of the project this build is targeting */
  project: string
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
 * The builder progress interface as used for logging progress our all builder outputs
 */
export interface Progress {
  state: 'running' | 'succeeded' | 'errored' | 'cancelled' | 'completed'
  builderMessage: string
  error: string
  success: boolean
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
 * Forks a worker thread and sets up event listners on the master thread which emits `BuilderOutput` events
 * @param output$ Builder output subject
 */
export const scheduleWorker = (context: BuilderContext): Observable<BuilderOutput> => {
  const progress$ = new ReplaySubject<Progress>()
  const output$ = new ReplaySubject<BuilderOutput>()
  const loader = ora()

  const subscription = progress$.asObservable().subscribe((progress) => {
    loader.indent = 2
    // eslint-disable-next-line default-case
    switch (progress.state) {
      case 'running':
        loader.start(`${progress.builderMessage} started.`)
        break
      case 'succeeded':
        loader.succeed(`${progress.builderMessage} completed.`)
        break
      case 'errored':
        loader.fail(`${progress.builderMessage} failed.`)
        context.logger.error(`\n${progress.error}\n`)
        break
      case 'cancelled':
        loader.info(`${progress.builderMessage} cancelled.`)
        break
      case 'completed':
        output$.next({ success: progress.success })
        break
    }
  })

  /**
   * Sets the `Prgress` state. Runs every time the cluster master receives a message from its worker.
   * @param progress `Progress` object
   */
  const onWorkerMessage = (progress: Progress): void => {
    progress$.next(progress)
  }

  /**
   * Handles errors gracefully when a worker process has failed
   * @param error `Error` object
   */
  const onWorkerError = ({ message }: Error): void => {
    output$.next({
      success: false,
      error:
        // prettier-ignore
        `Worker processs failed with exception.\n\n` +
          `The reason for this is due to one of the following reasons:\n\n` +
          `  1. The worker could not be spawned, or\n` + 
          `  2. The worker could not be killed, or\n` +
          `  3. The worker were unable to send a message to the master.\n\n` +
          `Error message: ${message}`,
    })
    output$.complete()
  }

  /**
   * Exists process when a worker was killed or exited
   * @param worker `Worker` object
   * @param code Exit code
   * @param signal Exit signal
   */
  const onWorkerExit = (_worker: cluster.Worker, code: number): void => {
    if (code) {
      output$.next({
        success: false,
        error: `Worker process exited with exit code ${code}.`,
      })
    }
    output$.complete()
  }
  // Do not pipe the worker's stdout or stderr
  cluster.setupMaster({ silent: true })
  cluster
    .fork()
    // When the worker emits a message
    .on('message', onWorkerMessage)
    // When the worker has thrown a critical error
    .on('error', onWorkerError)
    // When the worker has been either exited or killed
    .on('exit', onWorkerExit)

  return output$.asObservable().pipe(finalize(() => subscription.unsubscribe()))
}

/**
 * Takes a list of builder tasks, executes them in sequence and returns a `BuilderOutput` observable. The builder output will only return `success: true` if all tasks has resolved without error.
 * @param builderMessage Message to print when the builder is initialized
 * @param builders List of build tasks to be executed in this builder context
 */
export const builderHandler = (builderMessage: string, builders: Builders) => {
  return (options: Options, context: BuilderContext): Observable<BuilderOutput> => {
    const project = context.target && context.target.project ? context.target.project : ''
    if (!project) {
      throw new Error(`The builder '${context.builder.builderName}' could not execute. No project was found.`)
    }

    // Clear console from previous build
    // eslint-disable-next-line no-console
    console.clear()

    // Logs initializaton message
    context.logger.info(`\n${builderMessage} ${cyan(project)} \n`)

    const assignContext = map(
      (metadata: JsonObject) =>
        ({
          project,
          options: { ...options, ...{ verbose: IS_SINGLE_CPU ? true : options.verbose } },
          context,
          metadata,
        } as Context)
    )

    const logOutputResult = tap(({ success }: BuilderOutput) => {
      if (success) context.logger.info(dim(`\nCompleted successfully.\n`))
      else context.logger.info(dim(`\nCompleted with error.\n`))
    })

    const disconnectWorker = finalizeWithValue<BuilderOutput>(({ success }) => {
      if (cluster.isWorker) {
        process.send({ state: 'completed', success } as Progress)
        process.disconnect()
      }
    })

    if (cluster.isMaster) {
      if (!IS_SINGLE_CPU) {
        if (!options.verbose) {
          return scheduleWorker(context).pipe(logOutputResult)
        }
      } else {
        context.logger.info(`Builder is running on a single-core processing unit. Enabling single-threaded execution.`)
      }
    }

    const projectMetadata = context.getProjectMetadata(project)

    const initializer = from(projectMetadata)
      // Initialize the builder
      .pipe(first(), assignContext)

    // eslint-disable-next-line prefer-spread
    return pipeFromArray(builders)(initializer).pipe(last(), pluck<Context, BuilderOutput>('output'), logOutputResult, disconnectWorker)
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
  let isRunning = false
  return concatMap((context: Context) => {
    const output$: ReplaySubject<BuilderOutput> = new ReplaySubject()
    const completed$: ReplaySubject<void> = new ReplaySubject()

    context.context.logger.info(inverse(`\n ${builderMessage} \n`))

    if (isRunning) {
      if (cluster.isWorker) {
        process.send({ state: 'cancelled', builderMessage } as Progress)
      }
    } else {
      isRunning = true
      if (cluster.isWorker) {
        process.send({ state: 'running', builderMessage } as Progress)
      }
    }

    /**
     * Executes when the builder is an observable and that observable has emitted a new value.
     * @param builderOutput Builder output object
     */
    const onNext = ({ success, error }: BuilderOutput): void => {
      isRunning = false
      if (cluster.isWorker) {
        if (success) {
          process.send({ state: 'succeeded', builderMessage } as Progress)
        } else {
          process.send({ state: 'errored', error: toError(error), builderMessage } as Progress)
        }
      }
      output$.next({ success, error })
    }

    /**
     * Executes when the builder's callback either has:
     * 1. Returned a observable which has completed with an error, or
     * 2. Returned a promise which has rejected, or
     * 3. Thrown an error
     * @param error Error message or object
     */
    const onError = (error: string): void => {
      if (cluster.isWorker) {
        process.send({ state: 'errored', error: toError(error), builderMessage } as Progress)
      }
      output$.next({ success: false, error: toError(error) })
      output$.complete()
      completed$.unsubscribe()
    }

    /**
     * Executes when the builder's callback was completed
     */
    const onComplete = (): void => {
      output$.complete()
      completed$.unsubscribe()
    }

    /**
     * Returns a builder callback as observable
     */
    // eslint-disable-next-line consistent-return
    const getBuilderCallback = (): Observable<BuilderOutput> => {
      if (is(String, builder)) {
        return from(
          context.context.scheduleBuilder(builder as string, { ...{ builderOptions } }, ({
            target: context.context.target,
            logger: context.context.logger,
          } as unknown) as ScheduleOptions)
        ).pipe(switchMap((builderRun) => builderRun.output))
      }
      if (is(Function, builder)) {
        const builderCallbackResult = (builder as BuilderCallback)(context)
        if (isObservable(builderCallbackResult)) return builderCallbackResult as Observable<BuilderOutput>
        if (is(Promise, builderCallbackResult)) return from(builderCallbackResult as Promise<BuilderOutput>)
        if (is(Object, builderCallbackResult)) return of(builderCallbackResult as BuilderOutput)
        throw new Error(
          `Could not schedule builder. The builder callback ${builderMessage} returned a value which is not a Promise, Observable or Object.`
        )
      }
    }

    /**
     * Transforms `BuilderOutput` to `Context` object
     * @param builderOutput `BuilderOutput` object
     */
    const toContext = map(
      ({ success, error }: BuilderOutput) =>
        ({
          ...context,
          output: context.output ? { success: success === false ? false : context.output.success, error } : { success, error },
        } as Context)
    )

    /**
     * Logs process results
     * @param builderOutput `BuilderOutput` object
     */
    const logProcessResult = tap(({ output }: Context) => {
      if (output.success) context.context.logger.info(bgGreen.black(`\n ${builderMessage} completed \n`))
      else context.context.logger.info(bgRed.black(`\n ${builderMessage} failed \n`))
    })

    getBuilderCallback().pipe(takeUntil(completed$)).subscribe(onNext, onError, onComplete)

    return output$.asObservable().pipe(toContext, logProcessResult)
  })
}
