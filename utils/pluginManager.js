import fs from "fs";
import path from "path";
import {spawn} from "child_process";
import {fileURLToPath, pathToFileURL} from "url";

// 获取 pluginManager.js 的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// plugin.js 和 plugin.example.js 在上级目录
const userConfigPath = path.join(__dirname, "../plugin.js");
const exampleConfigPath = path.join(__dirname, "../plugin.example.js");

// 尝试加载用户配置，如果没有就用 example
let plugins = [];
try {
    console.log(`检查插件配置文件: ${userConfigPath} 是否存在`);
    if (fs.existsSync(userConfigPath)) {
        plugins = (await import(pathToFileURL(userConfigPath).href)).default;
        console.log("[pluginManager] 使用用户 plugin.js 配置");
    } else if (fs.existsSync(exampleConfigPath)) {
        plugins = (await import(pathToFileURL(exampleConfigPath).href)).default;
        console.log("[pluginManager] 使用默认 plugin.example.js 配置");
    }
} catch (err) {
    console.error("[pluginManager] 加载插件配置失败:", err);
    plugins = [];
}

/**
 * 获取插件对应的二进制文件路径
 * @param {string} rootDir 项目根目录
 * @param {string} pluginPath 插件目录路径 (例: plugins/req-proxy)
 * @param {string} pluginName 插件名 (例: req-proxy)
 */
function getPluginBinary(rootDir, pluginPath, pluginName) {
    const platform = process.platform;
    const binDir = path.join(rootDir, pluginPath);

    let binaryName = null;
    if (platform === "win32") {
        binaryName = `${pluginName}-windows.exe`;
    } else if (platform === "linux") {
        binaryName = `${pluginName}-linux`;
    } else if (platform === "darwin") {
        binaryName = `${pluginName}-darwin`;
    } else if (platform === "android") {
        binaryName = `${pluginName}-android`;
    } else {
        console.log("[getPluginBinary] Unsupported platform: " + platform);
        return null;
    }

    return path.join(binDir, binaryName);
}

/**
 * 启动插件
 * @param {Object} plugin 插件配置
 * @param {string} rootDir 项目根目录
 */
function startPlugin(plugin, rootDir) {
    if (!plugin.active) {
        console.log(`[pluginManager] 插件 ${plugin.name} 未激活，跳过`);
        return null;
    }

    const binary = getPluginBinary(rootDir, plugin.path, plugin.name);
    if (!binary || !fs.existsSync(binary)) {
        console.error(`[pluginManager] 插件 ${plugin.name} 的二进制文件不存在: ${binary}`);
        return null;
    }

    console.log(`[pluginManager] 启动插件 ${plugin.name}: ${binary} ${plugin.params || ""}`);

    const args = plugin.params ? plugin.params.split(" ") : [];
    let proc;

    try {
        proc = spawn(binary, args, {
            stdio: ["ignore", "pipe", "pipe"],
        });
    } catch (err) {
        console.error(`[pluginManager] 插件 ${plugin.name} 启动失败 (spawn 出错):`, err.message);
        return null;
    }

    // 检查是否真的启动了
    if (!proc || !proc.pid) {
        console.error(`[pluginManager] 插件 ${plugin.name} 启动失败 (无效的进程 PID)`);
        return null;
    }

    proc.stdout.on("data", (data) => {
        console.log(`[${plugin.name}]`, data.toString().trim());
    });

    proc.stderr.on("data", (data) => {
        console.error(`[${plugin.name}-STD]`, data.toString().trim());
    });

    proc.on("exit", (code, signal) => {
        console.log(`[pluginManager] 插件 ${plugin.name} 退出 (code=${code}, signal=${signal})`);
    });

    proc.on("error", (err) => {
        console.error(`[pluginManager] 插件 ${plugin.name} 运行中出错:`, err.message);
    });

    return proc;
}

/**
 * 启动所有插件
 * @param {string} rootDir 项目根目录
 */
export function startAllPlugins(rootDir = process.cwd()) {
    console.log("[pluginManager] 准备启动所有插件...");
    const processes = {};
    for (const plugin of plugins) {
        const proc = startPlugin(plugin, rootDir);
        if (proc) {
            processes[plugin.name] = proc;
        } else {
            console.error(`[pluginManager] 插件 ${plugin.name} 启动失败，未加入到 processes`);
        }
    }
    return processes;
}
