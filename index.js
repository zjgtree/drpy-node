import * as fastlogger from './controllers/fastlogger.js'
import path from 'path';
import os from 'os';
import qs from 'qs';
import {fileURLToPath} from 'url';
import {spawn} from "child_process";
import {existsSync} from 'fs';
import formBody from '@fastify/formbody';
import {validateBasicAuth, validateJs, validatePwd} from "./utils/api_validate.js";
import {goProxy, getGoBinary} from "./utils/binaryManager.js"
// 注册自定义import钩子
import './utils/esm-register.mjs';
// 引入python守护进程
import {daemon} from "./utils/daemonManager.js";
// 注册控制器
import {registerRoutes} from './controllers/index.js';

const {fastify} = fastlogger;

// 获取当前路径
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5757;
const GOPORT = 57571;
const MAX_TEXT_SIZE = 0.1 * 1024 * 1024; // 设置最大文本大小为 0.1 MB
// 定义options的目录
const docsDir = path.join(__dirname, 'docs');
const jxDir = path.join(__dirname, 'jx');
const publicDir = path.join(__dirname, 'public');
const appsDir = path.join(__dirname, 'apps');
const jsonDir = path.join(__dirname, 'json');
const jsDir = path.join(__dirname, 'spider/js');
const dr2Dir = path.join(__dirname, 'spider/js_dr2');
const pyDir = path.join(__dirname, 'spider/py');
const catDir = path.join(__dirname, 'spider/catvod');
const catLibDir = path.join(__dirname, 'spider/catLib');
const xbpqDir = path.join(__dirname, 'spider/xbpq');
const viewsDir = path.join(__dirname, 'views');
const configDir = path.join(__dirname, 'config');
const goBinary = getGoBinary(__dirname);
let goProc = null;
// 注册插件以支持 application/x-www-form-urlencoded
fastify.register(formBody);

// 添加钩子事件
fastify.addHook('onReady', async () => {
    try {
        await daemon.startDaemon();
        fastify.log.info('Python守护进程已启动');
    } catch (error) {
        fastify.log.error(`启动Python守护进程失败: ${error.message}`);
        fastify.log.error('Python相关功能将不可用');
    }
});

async function onClose() {
    try {
        await daemon.stopDaemon();
        fastify.log.info('Python守护进程已停止');
    } catch (error) {
        fastify.log.error(`停止Python守护进程失败: ${error.message}`);
    }
}

// 停止时清理守护进程
fastify.addHook('onClose', async () => {
    await onClose();
});

// 给静态目录插件中心挂载basic验证
fastify.addHook('preHandler', (req, reply, done) => {
    if (req.raw.url.startsWith('/apps/')) {
        validateBasicAuth(req, reply, done);
    } else if (req.raw.url.startsWith('/js/') || req.raw.url.startsWith('/py/')) {
        validatePwd(req, reply, done).then(async () => {
            validateJs(req, reply, dr2Dir).then(() => done());
        });
    } else {
        done();
    }
});

// 自定义插件替换 querystring 解析行为.避免出现两个相同参数被解析成列表
fastify.addHook('onRequest', async (req, reply) => {
    // 获取原始 URL 中的 query 部分
    const rawUrl = req.raw.url;
    const urlParts = rawUrl.split('?');
    const urlPath = urlParts[0];
    let rawQuery = urlParts.slice(1).join('?'); // 处理可能存在的多个 '?' 情况
    // log('rawQuery:', rawQuery);
    // 使用 qs 库解析 query 参数，确保兼容参数值中包含 '?' 的情况
    req.query = qs.parse(rawQuery, {
        strictNullHandling: true, // 确保 `=` 被解析为空字符串
        arrayLimit: 100,         // 自定义数组限制
        allowDots: false,        // 禁止点号表示嵌套对象
    });
    // 如果需要，可以在这里对 req.query 进行进一步处理
});

process.on('unhandledRejection', (err) => {
    fastify.log.error(`未处理的Promise拒绝:${err.message}`);
    console.log(`发生了致命的错误，已阻止进程崩溃。${err.stack}`);
    // 根据情况决定是否退出进程
    // 清理后退出进程（避免程序处于未知状态）
    // process.exit(1);
});

// 统一退出处理函数
const handleExit = async (signal) => {
    try {
        console.log(`\nReceived ${signal}, closing server...`);
        // Fastify 提供的关闭方法，内部会触发 onClose 钩子
        await onClose();
        console.log('Fastify closed successfully');
        process.exit(0);
    } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
    }
};

// 捕获常见退出信号（Linux 上 pm2 stop 会发 SIGINT 或 SIGTERM）
['SIGINT', 'SIGTERM', 'SIGUSR2'].forEach((sig) => {
    process.on(sig, () => handleExit(sig));
});

// Windows 上的兼容处理：捕获 Ctrl+C
if (process.platform === 'win32') {
    const rl = (await import('readline')).createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.on('SIGINT', () => {
        handleExit('SIGINT');
    });
}

// 捕获 Node.js 主动退出（比如 pm2 stop 也会触发 exit）
process.on('exit', async (code) => {
    console.log(`Process exiting with code: ${code}`);
    // 这里不能直接用 await fastify.close()（Node 在 exit 里不等异步）
    // 但 Fastify 的 SIGINT/SIGTERM 会提前触发，所以这里只记录日志
    if (goProc) {
        goProc.kill();
    }
});

registerRoutes(fastify, {
    rootDir: __dirname,
    docsDir,
    jxDir,
    publicDir,
    appsDir,
    jsonDir,
    jsDir,
    dr2Dir,
    pyDir,
    catDir,
    catLibDir,
    xbpqDir,
    PORT,
    MAX_TEXT_SIZE,
    viewsDir,
    configDir,
    indexFilePath: path.join(__dirname, 'index.json'),
    customFilePath: path.join(__dirname, 'custom.json'),
    subFilePath: path.join(__dirname, 'public/sub/sub.json'),
});


// 启动服务
const start = async () => {
    try {

        if (existsSync(goBinary)) { // 启动golang二进制
            console.log('[goBinary]准备启动go二进制文件:', goBinary);
            goProc = spawn(goBinary, ["-p", GOPORT], {
                stdio: ["ignore", "pipe", "pipe"],
            });

            // 打印 Go 服务输出
            goProc.stdout.on("data", (data) => {
                console.log("[Go-Server]", data.toString().trim());
            });
            goProc.stderr.on("data", (data) => {
                console.log("[Go-Server-STD]", data.toString().trim());
            });
        } else {
            console.log(`[goBinary]找不到go二进制文件:${goBinary},跳过启动`);
        }
        // 启动 Fastify 服务
        // await fastify.listen({port: PORT, host: '0.0.0.0'});
        await fastify.listen({port: PORT, host: '::'});

        // 获取本地和局域网地址
        const localAddress = `http://localhost:${PORT}`;
        const interfaces = os.networkInterfaces();
        let lanAddress = 'Not available';
        // console.log('interfaces:', interfaces);
        for (const [key, iface] of Object.entries(interfaces)) {
            if (key.startsWith('VMware Network Adapter VMnet') || !iface) continue;
            for (const config of iface) {
                if (config.family === 'IPv4' && !config.internal) {
                    lanAddress = `http://${config.address}:${PORT}`;
                    break;
                }
            }
        }

        console.log(`Server listening at:`);
        console.log(`- Local: ${localAddress}`);
        console.log(`- LAN:   ${lanAddress}`);
        console.log(`- PLATFORM:   ${process.platform} ${process.arch}`);
        console.log(`- VERSION:   ${process.version}`);
        if (process.env.VERCEL) {
            console.log('Running on Vercel!');
            console.log('Vercel Environment:', process.env.VERCEL_ENV); // development, preview, production
            console.log('Vercel URL:', process.env.VERCEL_URL);
            console.log('Vercel Region:', process.env.VERCEL_REGION);
        } else {
            console.log('Not running on Vercel!');
        }

    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

// 停止服务
const stop = async () => {
    try {
        await fastify.server.close(); // 关闭服务器
        console.log('Server stopped gracefully');
    } catch (err) {
        fastify.log.error('Error while stopping the server:', err);
    }
};

// 导出 start 和 stop 方法
export {start, stop};
export default async function handler(req, res) {
    await fastify.ready()
    fastify.server.emit('request', req, res)
}

// 判断当前模块是否为主模块，如果是主模块，则启动服务
const currentFile = path.normalize(fileURLToPath(import.meta.url)); // 使用 normalize 确保路径一致
const indexFile = path.normalize(path.resolve(__dirname, 'index.js')); // 标准化路径

if (currentFile === indexFile) {
    start();
}
