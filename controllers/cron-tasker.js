// cron-tasker.js（已修复）
import path from 'path';
import {readdir, stat} from 'fs/promises';
import {pathToFileURL} from 'url';
import {CronJob} from 'cron';
import {validateBasicAuth} from "../utils/api_validate.js"; // 官方 cron

const scripts_exclude = ['moontv.mjs', 'kzz.mjs'];
const enable_tasker = Number(process.env.ENABLE_TASKER) || 0;

export default (fastify, options, done) => {
    const config = {
        scriptsDir: path.join(options.rootDir, 'scripts/cron'),
    };

    const taskRegistry = new Map();

    function getNextRunFromJob(job) {
        try {
            if (!job) return null;
            if (typeof job.nextDate === 'function') {
                const nd = job.nextDate();
                if (!nd) return null;
                if (nd instanceof Date) return nd;
                if (typeof nd.toJSDate === 'function') return nd.toJSDate();
                if (typeof nd.toDate === 'function') return nd.toDate();
                if (typeof nd.toISOString === 'function') return new Date(nd.toISOString());
                return new Date(nd);
            }
            if (typeof job.nextDates === 'function') {
                const arr = job.nextDates(1);
                const nd = Array.isArray(arr) ? arr[0] : arr;
                if (!nd) return null;
                if (nd instanceof Date) return nd;
                if (typeof nd.toJSDate === 'function') return nd.toJSDate();
                if (typeof nd.toDate === 'function') return nd.toDate();
                if (typeof nd.toISOString === 'function') return new Date(nd.toISOString());
                return new Date(nd);
            }
            return null;
        } catch (err) {
            return null;
        }
    }

    async function registerScript(scriptPath) {
        try {
            fastify.log.info(`📝 Registering script: ${scriptPath}`);
            const scriptUrl = pathToFileURL(scriptPath).href;
            const module = await import(scriptUrl);
            const script = module.default || module;

            if (typeof script.run !== 'function') {
                fastify.log.warn(`⚠️ Script ${scriptPath} does not export a 'run' function`);
                return;
            }

            const scriptName = path.basename(scriptPath, path.extname(scriptPath));

            const taskInfo = {
                name: scriptName,
                path: scriptPath,
                run: script.run,
                schedule: script.schedule || null,
                lastRun: null,
                nextRun: null,
                status: 'pending',
                cronTask: null
            };

            taskRegistry.set(scriptName, taskInfo);

            if (script.schedule) {
                // 如果 schedule 是字符串（简洁写法）
                if (typeof script.schedule === 'string') {
                    fastify.log.info(`⏰ Scheduling ${scriptName} with cron: ${script.schedule}`);

                    // 支持 runOnInit 与 timezone
                    const timezone = (script.schedule && script.timezone) || undefined;
                    const runOnInit = !!(script.runOnInit); // 不常用，通常传 object 形式时才会出现

                    const startImmediately = true; // 默认启动

                    const job = new CronJob(
                        script.schedule,
                        async () => {
                            await runTask(scriptName);
                        },
                        null,            // onComplete
                        startImmediately,// start
                        timezone,        // timeZone
                        fastify,         // context
                        runOnInit        // runOnInit
                    );

                    taskInfo.cronTask = job;
                    taskInfo.nextRun = getNextRunFromJob(job);

                    // 如果 schedule 是对象（支持更多选项）
                } else if (typeof script.schedule === 'object' && script.schedule.cron) {
                    const userOpts = script.schedule.options || {};

                    const cronParams = {
                        cronTime: script.schedule.cron,
                        onTick: async () => {
                            await runTask(scriptName);
                        },
                        start: (typeof userOpts.scheduled !== 'undefined') ? !!userOpts.scheduled : true,
                        timeZone: script.schedule.timezone || userOpts.timeZone || 'UTC',
                        context: fastify,
                        runOnInit: (typeof script.schedule.runOnInit !== 'undefined') ? !!script.schedule.runOnInit : !!userOpts.runOnInit,
                        name: scriptName,
                        ...userOpts
                    };

                    fastify.log.info(`⏰ Scheduling ${scriptName} with cron: ${script.schedule.cron} (timezone: ${cronParams.timeZone})`);

                    // 使用 from() 并让 cronParams.start/runOnInit 决定初次行为；不要再额外 start()/stop()
                    const job = CronJob.from(cronParams);

                    taskInfo.cronTask = job;
                    taskInfo.nextRun = getNextRunFromJob(job);

                } else if (typeof script.schedule === 'function') {
                    fastify.log.info(`⏰ Registering custom scheduler for ${scriptName}`);
                    const updateNextRun = (date) => {
                        taskInfo.nextRun = date;
                    };
                    script.schedule(async () => {
                        await runTask(scriptName);
                    }, fastify, updateNextRun);
                }

                // **重要**：不再在这里手动调用 runTask(scriptName) 来处理 runOnInit
                // 如果 script.schedule.runOnInit 为 true，我们把它传给 CronJob 让库负责首次触发，
                // 否则如果你希望手动触发，可把 runOnInit 设为 false 并在脚本或外部触发。
            } else {
                fastify.log.info(`ℹ️ No schedule defined for ${scriptName}, manual execution only`);
            }

            taskInfo.status = 'registered';
        } catch (err) {
            fastify.log.error(`❌ Error registering script ${scriptPath}: ${err.message}`);
        }
    }

    async function runTask(taskName) {
        const task = taskRegistry.get(taskName);
        if (!task) {
            fastify.log.error(`❌ Task not found: ${taskName}`);
            return;
        }

        try {
            task.lastRun = new Date();
            task.status = 'running';

            fastify.log.info(`🚀 Starting task: ${taskName}`);
            await task.run(fastify);

            task.status = 'success';
            fastify.log.info(`✅ Task completed: ${taskName}`);
        } catch (err) {
            task.status = 'failed';
            fastify.log.error(`❌ Task failed: ${taskName} ${err.message}`);
        }

        if (task.cronTask) {
            task.nextRun = getNextRunFromJob(task.cronTask);
        }
    }

    async function registerAllScripts() {
        try {
            fastify.log.info('📂 Loading scripts...');
            const files = await readdir(config.scriptsDir);
            for (const file of files) {
                const filePath = path.join(config.scriptsDir, file);
                const fileStat = await stat(filePath);
                if (fileStat.isFile() && ['.mjs', '.js'].includes(path.extname(file)) && !scripts_exclude.includes(file)) {
                    await registerScript(filePath);
                }
            }
            fastify.log.info(`✅ Registered ${taskRegistry.size} tasks`);
        } catch (err) {
            fastify.log.error(`❌ Error loading scripts:${err.message}`);
        }
    }

    // API endpoints unchanged...
    // 添加API端点（保持不变）
    fastify.get('/execute-now/:taskName?', {preHandler: validateBasicAuth}, async (request, reply) => {
        const {taskName} = request.params;

        if (taskName) {
            // 执行单个任务
            if (!taskRegistry.has(taskName)) {
                return reply.status(404).send({
                    error: 'Task not found',
                    availableTasks: [...taskRegistry.keys()]
                });
            }

            await runTask(taskName);
            return {
                message: `Task "${taskName}" executed manually`,
                status: 'success',
                task: taskRegistry.get(taskName)
            };
        }

        // 执行所有任务
        for (const taskName of taskRegistry.keys()) {
            await runTask(taskName);
        }

        return {
            message: 'All tasks executed manually',
            status: 'success',
            tasks: [...taskRegistry.values()].map(t => t.name)
        };
    });

    fastify.get('/tasks', {preHandler: validateBasicAuth}, async (request, reply) => {
        const tasks = [...taskRegistry.values()].map(task => ({
            name: task.name,
            schedule: task.schedule,
            status: task.status,
            lastRun: task.lastRun,
            nextRun: task.nextRun,
            path: task.path
        }));

        return tasks;
    });

    fastify.get('/tasks/:taskName', {preHandler: validateBasicAuth}, async (request, reply) => {
        const {taskName} = request.params;

        if (!taskRegistry.has(taskName)) {
            return reply.status(404).send({
                error: 'Task not found',
                availableTasks: [...taskRegistry.keys()]
            });
        }

        const task = taskRegistry.get(taskName);
        return {
            name: task.name,
            schedule: task.schedule,
            status: task.status,
            lastRun: task.lastRun,
            nextRun: task.nextRun,
            path: task.path
        };
    });

    fastify.addHook('onClose', async () => {
        fastify.log.info('🛑 Stopping all scheduled tasks...');
        for (const task of taskRegistry.values()) {
            if (task.cronTask && typeof task.cronTask.stop === 'function') {
                try {
                    task.cronTask.stop();
                    fastify.log.info(`⏹️ Stopped task: ${task.name}`);
                } catch (e) {
                    fastify.log.error(`❌ Failed stopping task ${task.name}: ${e.message}`);
                }
            }
        }
        taskRegistry.clear();
    });

    (async () => {
        try {
            if (enable_tasker) await registerAllScripts();
            done();
        } catch (err) {
            fastify.log.error(`❌ Failed to register scripts:${err.message}`);
            done(err);
        }
    })();
};
