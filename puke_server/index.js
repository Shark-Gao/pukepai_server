"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// 使用 ts-node 需要安装 tsconfig-paths 来正确解析路径别名,tsconfig中的别名
require("tsconfig-paths/register");
const koa_1 = require("koa");
const koa_body_1 = require("koa-body");
const serve = require("koa-static");
const timing = require("koa-xtime");
const decors_1 = require("./utils/decors");
const path = require("path");
const mount = require("koa-mount");
const KoaCors = require("koa2-cors");
const webSocket_1 = require("./router/websocket/webSocket");
const app = new koa_1.default();
// 使用 cors 中间件，允许所有域名跨域访问
app.use(KoaCors());
app.use(timing());
// 使用koa-mount设置静态资源的访问前缀
app.use(mount('/static', serve(path.resolve(__dirname, '../static/'), {
    // 其他选项...
    setHeaders: (res) => {
        // 在这里设置你的响应头（Accept-Ranges 这表示服务器能够处理字节范围请求，解决播放音乐快进重写请求资源导致从头播放）
        res.setHeader('Accept-Ranges', 'bytes');
    }
})));
// 解析post请求体
app.use((0, koa_body_1.koaBody)());
// 中间件添加router
const router = (0, decors_1.loader)(path.resolve(__dirname, './router'));
// allowedMethods: 将路由挂载到 Koa 应用（接口）
app.use(router.routes()).use(router.allowedMethods());
// 使用环境变量PORT（Render平台要求），如果没有则使用3002
const PORT = process.env.PORT || 3002;
let server = app.listen(PORT, () => {
    console.log('server start on port', PORT);
});
// 创建 WebSocket 服务器并将其挂载到 HTTP 服务器上
webSocket_1.default.init(server);
//# sourceMappingURL=index.js.map