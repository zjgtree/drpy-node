import {execSync} from 'child_process';
import {existsSync, readdirSync, statSync} from 'fs';
import {join, basename, dirname, resolve, relative} from 'path';
import url from 'url';

// 要排除的目录列表
const EXCLUDE_DIRS = ['.git', '.idea', 'soft', 'pyTools', 'drop_code', 'jstest', 'local', 'logs', '对话1.txt', 'vod_cache', 'data/mv'];

// 要排除的文件列表
const EXCLUDE_FILES = ['config/env.json', '.env', 'js/UC分享.js', 'js/百忙无果[官].js', 'json/UC分享.json', 'jx/奇奇.js', 'jx/芒果关姐.js', 'data/settings/link_data.json', 'index.json', 'custom.json'];

// 获取脚本所在目录
const getScriptDir = () => dirname(resolve(url.fileURLToPath(import.meta.url)));

// 筛选带 [密] 的文件
const filterGreenFiles = (scriptDir) => {
    const jsDir = join(scriptDir, 'js');
    const greenFiles = [];

    if (existsSync(jsDir)) {
        const stack = [jsDir];
        while (stack.length) {
            const currentDir = stack.pop();
            const items = readdirSync(currentDir);
            for (const item of items) {
                const fullPath = join(currentDir, item);
                const stats = statSync(fullPath);
                if (stats.isDirectory()) {
                    stack.push(fullPath);
                } else if (/\[密[^\]]*\]/.test(item)) {
                    greenFiles.push(relative(scriptDir, fullPath));
                }
            }
        }
    }
    return greenFiles;
};

// 压缩目录
const compressDirectory = (scriptDir, green) => {
    const currentDir = basename(scriptDir);
    const currentTime = new Date().toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).replace(/\//g, '');
    const archiveSuffix = green ? '-green' : '';
    const archiveName = `${currentDir}-${currentTime}${archiveSuffix}.7z`;

    const parentDir = resolve(scriptDir, '..');
    const archivePath = join(parentDir, archiveName);

    // 构建 7z 命令
    const excludeParams = [];

    // 排除目录
    for (const excludeDir of EXCLUDE_DIRS) {
        excludeParams.push(`-xr!${excludeDir}`);
    }

    // 排除文件
    for (const excludeFile of EXCLUDE_FILES) {
        const excludeFilePath = join(scriptDir, excludeFile);
        if (existsSync(excludeFilePath)) {
            excludeParams.push(`-xr!${excludeFile}`);
        } else {
            console.warn(`警告: ${excludeFile} 不存在!`);
        }
    }

    // 如果启用 green 筛选，排除不符合条件的文件
    if (green) {
        const greenFiles = filterGreenFiles(scriptDir);
        for (const file of greenFiles) {
            excludeParams.push(`-x!${file}`);
        }
    }

    // 构建命令，打包目录内容而不包含目录本身
    const command = `7z a "${archivePath}" "${join(scriptDir, '*')}" -r ${excludeParams.join(' ')}`;
    console.log(`构建的 7z 命令: ${command}`);

    try {
        execSync(command, {stdio: 'inherit'});
        console.log(`压缩完成: ${archivePath}`);
    } catch (error) {
        console.error(`压缩失败: ${error.message}`);
    }
};

// 主程序入口
const main = () => {
    const scriptDir = getScriptDir();

    // 简单解析命令行参数
    const args = process.argv.slice(2);
    const green = args.includes('-g') || args.includes('--green');

    compressDirectory(scriptDir, green);
};

main();
