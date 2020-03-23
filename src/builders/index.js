"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = require("chalk");
const cluster = __importStar(require("cluster"));
const ora_1 = __importDefault(require("ora"));
const ramda_1 = require("ramda");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const index_1 = require("../index");
/**
 * Takes a list of builder tasks, executes them in sequence and returns a `BuilderOutput` observable. The builder output will only return `success: true` if all tasks has resolved without error.
 * @param builderMessage Message to print when the builder is initialized
 * @param builders List of build tasks to be executed in this builder context
 */
exports.builderHandler = (builderMessage, builders) => {
    return (options, context) => {
        if (index_1.IS_SINGLE_CPU) {
            context.logger.info(`Builder is running on a single-core processing unit. Switching to single-threaded mode.`);
        }
        const project = context.target && context.target.project;
        if (!project) {
            context.logger.fatal(`The builder '${context.builder.builderName}' could not execute. No project was found.`);
        }
        const projectMetadata = context.getProjectMetadata(project);
        const assignContext = operators_1.map((metadata) => ({
            project,
            options: Object.assign(Object.assign({}, options), { verbose: index_1.IS_SINGLE_CPU ? true : options.verbose }),
            context,
            metadata,
        }));
        // Clear console from previous build
        // eslint-disable-next-line no-console
        console.clear();
        // Logs initializaton message
        context.logger.info(`\n${builderMessage} ${chalk_1.cyan(project)} \n`);
        const initializer = rxjs_1.from(projectMetadata)
            // Initialize the builder
            .pipe(operators_1.first(), assignContext);
        // eslint-disable-next-line prefer-spread
        const proccesser = initializer.pipe.apply(initializer, builders).pipe(operators_1.pluck('output'), operators_1.map(({ success, error }) => {
            if (success)
                context.logger.info(chalk_1.dim(`\nCompleted successfully.\n`));
            else {
                context.logger.info(chalk_1.dim(`\nCompleted with error.\n`));
            }
            return { success, error };
        }));
        return proccesser;
    };
};
/**
 * Shedules a build run for a specific builder target, logs the process of that build and returns an observable function which wraps a `Context` object
 * @param builderMessage Message to print when the builder is either initalized or completed
 * @param builder The name of a builder, i.e. its `package:builderName` tuple, or a builder callback function
 * @param builderOptions Additional options passed to the builder
 */
exports.scheduleBuilder = (builderMessage, builder, builderOptions) => {
    return operators_1.switchMap((context) => {
        const loader = ora_1.default({ indent: 2 });
        const builderOutput$ = new rxjs_1.ReplaySubject();
        /**
         * Transforms `BuilderOutput` to `Context` object
         * @param builderOutput `BuilderOutput` object
         */
        const toContext = operators_1.map(({ success, error }) => (Object.assign(Object.assign({}, context), { output: {
                // Only failed outcomes should persist
                success: success === false ? false : context.output.success,
                error,
            } })));
        /**
         * Initialize a new loading state for the worker
         */
        const onOnline = () => {
            if (cluster.isMaster) {
                // Close all running processes on hot reloads
                Object.keys(cluster.workers).forEach((index) => {
                    if (cluster.workers[index].isConnected()) {
                        loader.info(`Builder ${builderMessage} terminated`);
                        cluster.workers[index].disconnect();
                    }
                });
                loader.start(`Building ${builderMessage}`);
            }
        };
        /**
         * Sets the `BuilderOutput` state. Runs every time the cluster master receives a message from its worker.
         * @param builderOutput `BuilderOutput` object
         */
        const onWorkerMessage = ({ success, error }) => {
            if (success) {
                loader.succeed();
            }
            builderOutput$.next({ success, error });
        };
        /**
         * Handles errors gracefully when a worker process has failed
         * @param error `Error` object
         */
        const onWorkerError = ({ message }) => {
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
            });
            builderOutput$.complete();
        };
        /**
         * Exists process when a worker was killed or exited
         * @param worker `Worker` object
         * @param code Exit code
         * @param signal Exit signal
         */
        const onWorkerExit = (_worker, code, signal) => {
            if (code) {
                builderOutput$.next({
                    success: false,
                    error: 
                    // prettier-ignore
                    `Worker process for ${context.context.builder.builderName} failed with an exception.\n\n` +
                        `Process failed with exit code '${code}' and signal '${signal}'`,
                });
            }
            builderOutput$.complete();
        };
        /**
         * Executes when the builder is an observable and that observable has emitted a new value. Will only be called when the builder is in watch mode.
         * @param builderOutput Builder output object
         */
        const onBuilderCallbackNext = ({ success, error }) => {
            if (cluster.isWorker) {
                if (process.send) {
                    process.send({ success, error });
                }
            }
        };
        /**
         * Executes when the builder's callback either has:
         * 1. Returned a observable which has completed with an error, or
         * 2. Returned a promise which has rejected, or
         * 3. Thrown an error
         * @param error Error message or object
         */
        const onBuilderCallbackError = (error) => {
            if (cluster.isWorker) {
                if (process.send) {
                    process.send({ success: false, error });
                }
            }
            return rxjs_1.of({ success: false, error });
        };
        /**
         * Executes when the builder's callback either has:
         * 1. Returned a observable which has completed without error, or
         * 2. Returned a promise which has resolved, or
         * 3. Returned a value
         */
        const onBuilderCallbackComplete = () => {
            if (cluster.isWorker) {
                if (process.send) {
                    process.send({ success: true });
                }
            }
        };
        /**
         * Returns a builder callback as observable
         */
        const getBuilderCallback = () => {
            let builderCallback;
            if (ramda_1.is(String, builder)) {
                builderCallback = rxjs_1.from(context.context.scheduleBuilder(builder, Object.assign(Object.assign({}, context.options), { builderOptions }))).pipe(operators_1.switchMap((builderRun) => builderRun.output));
            }
            if (ramda_1.is(Function, builder)) {
                const builderCallbackFn = builder(context);
                if (ramda_1.is(Promise, builderCallbackFn))
                    builderCallback = rxjs_1.from(builderCallbackFn);
                if (ramda_1.is(Object, builderCallbackFn))
                    builderCallback = rxjs_1.of(builderCallbackFn);
                builderCallback = builderCallbackFn.pipe(operators_1.catchError(onBuilderCallbackError));
            }
            return builderCallback;
        };
        if (context.options.verbose) {
            // Verbose output will execute on a single thread
            return getBuilderCallback().pipe(toContext);
        }
        if (cluster.isMaster) {
            // Do not pipe the worker's stdout or stderr
            cluster.setupMaster({ silent: true });
            cluster
                .fork()
                // When the worker has been connected to master
                .on('online', onOnline)
                // When the worker emits a message
                .on('message', onWorkerMessage)
                // When the worker has thrown a critical error
                .on('error', onWorkerError)
                // When the worker has been either exited or killed
                .on('exit', onWorkerExit);
        }
        else {
            const subscription = getBuilderCallback()
                .pipe(operators_1.finalize(() => subscription.unsubscribe()))
                .subscribe(onBuilderCallbackNext, onBuilderCallbackError, onBuilderCallbackComplete);
        }
        return builderOutput$.asObservable().pipe(toContext);
    });
};
//# sourceMappingURL=index.js.map