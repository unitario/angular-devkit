import { Observable, OperatorFunction, of } from "rxjs";
import { mergeMap } from "rxjs/operators";

/**
 * Reactive conditional which will return operator functions based on predicate
 */
export const when = (predicate: (param: any) => boolean, ...operations: OperatorFunction<any, any>[]) => {
  return function (source: Observable<any>) {
    return source.pipe(
      mergeMap<any, Observable<any>>((value: any) => {
        const observable = of(value);
        return predicate(value) ? observable.pipe.apply(observable, operations) : observable
      })
    )
  }
}