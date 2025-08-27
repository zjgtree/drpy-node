import path from 'path';
import {readdir, stat} from 'fs/promises';
import {pathToFileURL} from 'url'; // 添加此导入


const scripts_exclude = ['moontv.mjs', 'kzz.mjs'];
const enable_tasker = Number(process.env.ENABLE_TASKER) || 0;
const tasker_interval = Number(process.env.TASKER_INTERVAL) || 30 * 60 * 1000; // 30分钟执行一次;


export default (fastify, options, done) => {
    const config = {
        scriptsDir: path.join(options.rootDir, 'scripts'), // 脚本目录
        interval: tasker_interval,
    };

    // 加载并执行单个脚本 (ESM 动态导入)
    async function executeScript(scriptPath) {
        try {
            fastify.log.info(`Executing script: ${scriptPath}`);

            const scriptUrl = pathToFileURL(scriptPath).href;
            // 动态导入 ES 模块
            const module = await import(scriptUrl);
            const script = module.default || module;

            if (typeof script.run === 'function') {
                await script.run(fastify);
            } else {
                fastify.log.warn(`Script ${scriptPath} does not export a 'run' function`);
            }
        } catch (err) {
            fastify.log.error(`Error executing script ${scriptPath}: ${err}`);
        }
    }

// 执行目录下所有脚本
    async function executeAllScripts() {
        try {
            fastify.log.info('Starting script execution...');

            const files = await readdir(config.scriptsDir);

            for (const file of files) {
                const filePath = path.join(config.scriptsDir, file);
                const fileStat = await stat(filePath);

                // 只处理.mjs和.js文件
                if (fileStat.isFile() && ['.mjs', '.js'].includes(path.extname(file)) && !scripts_exclude.includes(file)) {
                    console.log(`Starting script execution:${file}| ${filePath}`);
                    await executeScript(filePath);
                }
            }

            fastify.log.info('Script execution completed');
        } catch (err) {
            fastify.log.error(`Error reading scripts directory:${err}`);
        }
    }

// 启动定时任务
    function startScheduledTasks() {
        // 立即执行一次
        executeAllScripts().then(r => {
        });
        // 设置定时器
        setInterval(executeAllScripts, config.interval);

        fastify.log.info(`Scheduled tasks started, running every ${config.interval / 1000} seconds`);
    }

    fastify.get('/execute-now', async (request, reply) => {
        await executeAllScripts();
        return {message: 'Scripts executed manually'};
    });

    fastify.get('/status', async (request, reply) => {
        return {
            running: true,
            lastRun: new Date(),
            nextRun: new Date(Date.now() + config.interval)
        };
    });
    if (enable_tasker) {
        console.log('enable_tasker:', enable_tasker);
        console.log(`tasker_interval: ${tasker_interval} (ms) => ${tasker_interval / 60000}(m)`);
        // 启动定时任务
        startScheduledTasks();
    }
    done()
}