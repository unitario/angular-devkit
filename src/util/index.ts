import { is } from 'ramda'
import { defer, Observable, of, OperatorFunction } from 'rxjs'
import { finalize, mergeMap, tap } from 'rxjs/operators'

/**
 * Reactive conditional which will return operator functions based on predicate
 */
export const when = (predicate: (param: unknown) => boolean, ...operations: OperatorFunction<unknown, unknown>[]) => {
  return (source: Observable<unknown>): Observable<unknown> => {
    return source.pipe(
      mergeMap<unknown, Observable<unknown>>((value: unknown) => {
        const observable = of(value)
        // eslint-disable-next-line prefer-spread
        return predicate(value) ? observable.pipe.apply(observable, operations) : observable
      })
    )
  }
}

/**
 * Takes an unknown error and transform it into an error string
 */
export const toError = (error: any): string => {
  if (is(String, error)) return error
  if (is(Error, error)) return error.message
  if (is(Array, error)) return error.join('\n')
  return error
}

/**
 * Finalize observable with last emitted value
 * @param callback
 */
export function finalizeWithValue<T>(callback: (value: T) => void) {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return (source: Observable<T>) =>
    defer(() => {
      let lastValue: T
      return source.pipe(
        // eslint-disable-next-line no-return-assign
        tap((value) => (lastValue = value)),
        finalize(() => callback(lastValue))
      )
    })
}
