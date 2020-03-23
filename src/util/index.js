"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
/**
 * Reactive conditional which will return operator functions based on predicate
 */
// eslint-disable-next-line import/prefer-default-export
exports.when = (predicate, ...operations) => {
    return (source) => {
        return source.pipe(operators_1.mergeMap((value) => {
            const observable = rxjs_1.of(value);
            // eslint-disable-next-line prefer-spread
            return predicate(value) ? observable.pipe.apply(observable, operations) : observable;
        }));
    };
};
//# sourceMappingURL=index.js.map