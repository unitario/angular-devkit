"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const os_1 = require("os");
// eslint-disable-next-line import/no-cycle
var index_1 = require("./builders/index");
exports.builderHandler = index_1.builderHandler;
exports.scheduleBuilder = index_1.scheduleBuilder;
var util_1 = require("./util");
exports.when = util_1.when;
exports.IS_SINGLE_CPU = os_1.cpus().length === 1;
//# sourceMappingURL=index.js.map