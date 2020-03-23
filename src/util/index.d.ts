import { Observable, OperatorFunction } from 'rxjs';
/**
 * Reactive conditional which will return operator functions based on predicate
 */
export declare const when: (predicate: (param: unknown) => boolean, ...operations: OperatorFunction<unknown, unknown>[]) => (source: Observable<unknown>) => Observable<unknown>;
