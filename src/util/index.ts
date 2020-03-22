import { Observable, of, OperatorFunction } from 'rxjs'
import { mergeMap } from 'rxjs/operators'

/**
 * Reactive conditional which will return operator functions based on predicate
 */
// eslint-disable-next-line import/prefer-default-export
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
