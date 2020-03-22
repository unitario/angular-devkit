import { cpus } from 'os'

// eslint-disable-next-line import/no-cycle
export { Options, Context, BuilderCallback, Builders, builderHandler, scheduleBuilder } from './builders/index'

export { when } from './util'

export const IS_SINGLE_CPU = cpus().length === 1
