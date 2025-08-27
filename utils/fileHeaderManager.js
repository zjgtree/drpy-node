// fileHeaderManager.js
import fs from 'fs/promises';
import path from 'path';

class FileHeaderManager {
    static COMMENT_CONFIG = {
        '.js': {
            start: '/*',
            end: '*/',
            regex: /^\s*\/\*([\s\S]*?)\*\/\s*/,
            headerRegex: /@header\(([\s\S]*?)\)/,
            createComment: (content) => `/*\n${content}\n*/`,
            topCommentsRegex: /^(\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)+/
        },
        '.py': {
            start: '"""',
            end: '"""',
            regex: /^\s*"""([\s\S]*?)"""\s*/,
            headerRegex: /@header\(([\s\S]*?)\)/,
            createComment: (content) => `"""\n${content}\n"""`,
            topCommentsRegex: /^(\s*(#[^\n]*\n|'''[\s\S]*?'''|"""[\s\S]*?""")\s*)+/
        }
    };

    /**
     * 解析JavaScript对象字面量（支持无引号属性名）
     * @param {string} str 对象字符串
     * @returns {Object} 解析后的对象
     */
    static parseObjectLiteral(str) {
        const normalized = str
            .replace(/([{,]\s*)([a-zA-Z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
            .replace(/'([^']+)'/g, '"$1"');

        try {
            return JSON.parse(normalized);
        } catch (e) {
            try {
                return (new Function(`return ${str}`))();
            } catch {
                throw new Error(`Invalid header object: ${str}`);
            }
        }
    }

    /**
     * 读取文件头信息
     * @param {string} filePath 文件路径
     * @returns {Object|null} 头信息对象
     */
    static async readHeader(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        const ext = path.extname(filePath);
        const config = this.COMMENT_CONFIG[ext];

        if (!config) throw new Error(`Unsupported file type: ${ext}`);

        const match = content.match(config.regex);
        if (!match) return null;

        const headerMatch = match[0].match(config.headerRegex);
        if (!headerMatch) return null;

        try {
            return this.parseObjectLiteral(headerMatch[1].trim());
        } catch {
            return null;
        }
    }

    /**
     * 写入/更新文件头信息
     * @param {string} filePath 文件路径
     * @param {Object} headerObj 头信息对象
     */
    static async writeHeader(filePath, headerObj) {
        let content = await fs.readFile(filePath, 'utf8');
        const ext = path.extname(filePath);
        const config = this.COMMENT_CONFIG[ext];

        if (!config) throw new Error(`Unsupported file type: ${ext}`);

        const headerStr = `@header(${JSON.stringify(headerObj, null, 2)
            .replace(/"([a-zA-Z_$][\w$]*)":/g, '$1:')
            .replace(/"/g, "'")})`;

        const match = content.match(config.regex);

        if (match) {
            const [fullComment] = match;

            if (config.headerRegex.test(fullComment)) {
                content = content.replace(
                    config.headerRegex,
                    headerStr
                );
            } else {
                const updatedComment = fullComment
                        .replace(config.end, '')
                        .trim()
                    + `\n${headerStr}\n${config.end}`;

                content = content.replace(fullComment, updatedComment);
            }
        } else {
            const newComment = config.createComment(headerStr) + '\n\n';
            content = newComment + content;
        }

        await fs.writeFile(filePath, content);
    }

    /**
     * 移除头信息区域
     * @param {string} input 文件路径或文件内容
     * @param {Object} [options] 配置选项
     * @param {string} [options.mode='header-only'] 移除模式:
     *   - 'header-only': 只移除@header行（默认）
     *   - 'top-comments': 移除文件顶部所有连续注释块
     * @param {string} [options.fileType] 文件类型（当input为内容时必需）
     * @returns {Promise<string>|string} 移除头信息后的内容
     */
    static async removeHeader(input, options = {}) {
        const { mode = 'header-only', fileType } = options;

        // 判断输入类型：文件路径 or 文件内容
        const isFilePath = !input.includes('\n') && input.length < 256 &&
            (input.endsWith('.js') || input.endsWith('.py'));

        let content, ext;

        if (isFilePath) {
            content = await fs.readFile(input, 'utf8');
            ext = path.extname(input);
        } else {
            content = input;
            ext = fileType ? `.${fileType.replace(/^\./, '')}` : null;

            if (!ext) {
                throw new Error('fileType option is required when input is content');
            }
        }

        const config = this.COMMENT_CONFIG[ext];
        if (!config) throw new Error(`Unsupported file type: ${ext}`);

        // 模式1: 移除顶部所有连续注释块
        if (mode === 'top-comments') {
            const match = content.match(config.topCommentsRegex);
            if (match) {
                content = content.substring(match[0].length);
            }
            return content.trim();
        }

        // 模式2: 只移除@header行（默认模式）
        const match = content.match(config.regex);
        if (!match) return content.trim();

        let [fullComment, innerContent] = match;

        if (config.headerRegex.test(innerContent)) {
            innerContent = innerContent.replace(config.headerRegex, '');

            const cleanedInner = innerContent
                .split('\n')
                .filter(line => line.trim().length > 0)
                .join('\n');

            if (!cleanedInner.trim()) {
                content = content.replace(fullComment, '');
            } else {
                const newComment = `${config.start}${cleanedInner}${config.end}`;
                content = content.replace(fullComment, newComment);
            }
        }

        return content.trim();
    }

    /**
     * 获取文件大小
     * @param {string} filePath 文件路径
     * @param {Object} [options] 配置选项
     * @param {boolean} [options.humanReadable=false] 是否返回人类可读格式
     * @returns {Promise<number|string>} 文件大小（字节或人类可读字符串）
     */
    static async getFileSize(filePath, options = {}) {
        try {
            const stats = await fs.stat(filePath);
            const sizeInBytes = stats.size;

            if (options.humanReadable) {
                return this.formatFileSize(sizeInBytes);
            }
            return sizeInBytes;
        } catch (error) {
            throw new Error(`获取文件大小失败: ${error.message}`);
        }
    }

    /**
     * 格式化文件大小为人类可读格式
     * @param {number} bytes 文件大小（字节）
     * @returns {string} 格式化后的文件大小
     */
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

export default FileHeaderManager;