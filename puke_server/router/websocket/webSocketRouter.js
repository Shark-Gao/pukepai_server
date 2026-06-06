"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketRoute = void 0;
const webSocketRoomBaseRouter_1 = require("./webSocketRoomBaseRouter");
const webSocketPlayCardRouter_1 = require("./webSocketPlayCardRouter");
const webSocketDealCardsRouter_1 = require("./webSocketDealCardsRouter");
const webSocketMatch_1 = require("./webSocketMatch");
const webSocketShuangjianRouter_1 = require("./webSocketShuangjianRouter");
// 类转换为对象
function convertClassMethodsToObject(cls) {
    const prototype = cls.prototype;
    const methodObject = {};
    const propertyNames = Object.getOwnPropertyNames(prototype);
    for (const propertyName of propertyNames) {
        const property = prototype[propertyName];
        if (typeof property === 'function' && propertyName !== 'constructor') {
            methodObject[propertyName] = property;
        }
    }
    return methodObject;
}
// websocket 路由文件出口
exports.socketRoute = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, convertClassMethodsToObject(webSocketRoomBaseRouter_1.webSocketRoomBaseRouter)), convertClassMethodsToObject(webSocketPlayCardRouter_1.webSocketPlayCardRouter)), convertClassMethodsToObject(webSocketDealCardsRouter_1.webSocketDealCardsRouter)), convertClassMethodsToObject(webSocketMatch_1.webSocketMatchRouter)), convertClassMethodsToObject(webSocketShuangjianRouter_1.webSocketShuangjianRouter));
//# sourceMappingURL=webSocketRouter.js.map