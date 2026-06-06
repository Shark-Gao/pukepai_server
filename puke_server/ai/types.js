"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RobotLevel = void 0;
exports.normalizeRobotLevel = normalizeRobotLevel;
/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
var RobotLevel;
(function (RobotLevel) {
    RobotLevel[RobotLevel["Simple"] = 0] = "Simple";
    RobotLevel[RobotLevel["Medium"] = 1] = "Medium";
    RobotLevel[RobotLevel["Hell"] = 2] = "Hell";
})(RobotLevel || (exports.RobotLevel = RobotLevel = {}));
function normalizeRobotLevel(level) {
    const value = Number(level);
    if (value === RobotLevel.Medium)
        return RobotLevel.Medium;
    if (value === RobotLevel.Hell)
        return RobotLevel.Hell;
    return RobotLevel.Simple;
}
//# sourceMappingURL=types.js.map