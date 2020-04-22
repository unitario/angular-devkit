/* eslint-disable import/no-cycle */
import { cpus } from 'os'

export { Options, Context, BuilderCallback, Builders, builderHandler, scheduleBuilder } from './builders/index'

export { when, toError, finalizeWithValue, toPaths } from './util'

export const IS_SINGLE_CPU = cpus().length === 1
