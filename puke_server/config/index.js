"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// 环境变量详细
const env = {
    'production': {
        'PUBLIC_FILE_BASE_URL': 'https://doudizhu-game-server.onrender.com'
    },
    'development': {
        'PUBLIC_FILE_BASE_URL': 'http://localhost:3000'
    }
};
exports.default = env[process.env.NODE_ENV || 'development'];
//# sourceMappingURL=index.js.map