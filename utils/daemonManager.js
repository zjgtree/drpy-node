import {PythonShell} from 'python-shell';
import path from 'path';
import fs from 'fs';
import net from 'net';
import {promisify} from 'util';
import {exec} from 'child_process';
import {fileURLToPath} from "url";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '../');
const hasWriteAccess = !process.env.VERCEL; // 非vercel环境才有write权限

function ensureDir(dir) {
    if (hasWriteAccess) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, {recursive: true});
        }
    }
}

function log(logFile, level, msg) {
    const line = `${new Date().toISOString()} [${level}] ${msg}\n`;
    fs.appendFileSync(logFile, line);
    if (level === 'ERROR' || level === 'CRITICAL') {
        console.error(line.trim());
    } else {
        console.log(line.trim());
    }
}

export class DaemonManager {
    constructor(rootDir) {
        this.rootDir = rootDir;
        this.config = this.getDaemonConfig();
        this.daemonShell = null;
    }

    getDaemonConfig() {
        const logsDir = path.join(this.rootDir, 'logs');
        ensureDir(logsDir);

        return {
            pidFile: path.join(this.rootDir, 't4_daemon.pid'),
            logFile: path.join(logsDir, 'daemon.log'),
            daemonScript: path.join(this.rootDir, 'spider/py/core', 't4_daemon.py'),
            clientScript: path.join(this.rootDir, 'spider/py/core', 'bridge.py'),
            host: '127.0.0.1',
            port: 57570,
        };
    }

    getPythonPath() {
        if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
        if (process.env.VIRTUAL_ENV) {
            return process.platform === 'win32'
                ? path.join(process.env.VIRTUAL_ENV, 'Scripts', 'python')
                : path.join(process.env.VIRTUAL_ENV, 'bin', 'python');
        }
        return process.platform === 'win32' ? 'python.exe' : 'python3';
    }

    async isPythonAvailable() {
        try {
            const {stdout} = await execAsync(`${this.getPythonPath()} --version`);
            return stdout.includes('Python');
        } catch {
            return false;
        }
    }

    cleanupFiles() {
        if (hasWriteAccess) {
            try {
                if (fs.existsSync(this.config.pidFile)) fs.unlinkSync(this.config.pidFile);
            } catch {
            }
        }
    }

    isDaemonRunning() {
        if (!fs.existsSync(this.config.pidFile)) return false;
        const pid = parseInt(fs.readFileSync(this.config.pidFile, 'utf8'), 10);
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    }

    async waitForServer(timeoutMs = 5000) {
        const {host, port} = this.config;
        const deadline = Date.now() + timeoutMs;

        return new Promise((resolve, reject) => {
            const tryConnect = () => {
                const socket = net.connect({host, port}, () => {
                    socket.end();
                    resolve(true);
                });
                socket.on('error', () => {
                    if (Date.now() > deadline) {
                        reject(new Error('守护进程未能在超时时间内启动'));
                    } else {
                        setTimeout(tryConnect, 300);
                    }
                });
            };
            tryConnect();
        });
    }

    async startDaemon() {
        if (this.isDaemonRunning()) {
            log(this.config.logFile, 'INFO', 'Python 守护进程已在运行');
            return;
        }

        this.cleanupFiles();

        const options = {
            mode: 'text',
            pythonPath: this.getPythonPath(),
            pythonOptions: ['-u'],
            scriptPath: path.dirname(this.config.daemonScript),
            env: {PYTHONIOENCODING: 'utf-8'},
            args: [
                '--pid-file', this.config.pidFile,
                '--log-file', this.config.logFile,
                '--host', this.config.host,
                '--port', this.config.port,
            ],
        };

        log(this.config.logFile, 'INFO', '正在启动 Python 守护进程...');
        const daemonShell = new PythonShell(path.basename(this.config.daemonScript), options);
        this.daemonShell = daemonShell;

        daemonShell.on('message', (m) => log(this.config.logFile, 'INFO', `[守护进程] ${m}`));
        daemonShell.on('stderr', (m) => log(this.config.logFile, 'INFO', `[守护进程] ${m}`));
        daemonShell.on('error', (err) => log(this.config.logFile, 'CRITICAL', `错误: ${err.message}`));
        daemonShell.on('close', (code) => {
            log(this.config.logFile, 'INFO', `守护进程退出，代码: ${code}`);
            this.cleanupFiles();
            this.daemonShell = null;
        });

        daemonShell.childProcess.on('spawn', () => {
            if (hasWriteAccess) {
                fs.writeFileSync(this.config.pidFile, daemonShell.childProcess.pid.toString());
            }
            log(this.config.logFile, 'INFO', `守护进程启动成功，PID: ${daemonShell.childProcess.pid}`);
        });

        await this.waitForServer();
    }

    async stopDaemon() {
        if (!this.isDaemonRunning()) {
            log(this.config.logFile, 'INFO', '没有运行的守护进程');
            return;
        }

        log(this.config.logFile, 'INFO', '正在停止守护进程...');
        const pid = parseInt(fs.readFileSync(this.config.pidFile, 'utf8'), 10);

        if (process.platform === 'win32') {
            exec(`taskkill /PID ${pid} /T /F`);
        } else {
            try {
                process.kill(pid, 'SIGTERM');
            } catch {
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));

        if (this.isDaemonRunning()) {
            log(this.config.logFile, 'WARN', '守护进程未退出，强制终止...');
            try {
                process.kill(pid, 'SIGKILL');
            } catch {
            }
        }

        this.cleanupFiles();
        this.daemonShell = null;
        log(this.config.logFile, 'INFO', '守护进程已停止');
    }
}


export const daemon = new DaemonManager(rootDir);