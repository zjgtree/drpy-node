import path from 'path';
import {readFile} from 'fs/promises';
import fileHeaderManager from "./fileHeaderManager.js";

// 接口basic验证
export const validateBasicAuth = (request, reply, done) => {
    if (!process.env.hasOwnProperty('API_AUTH_NAME') && !process.env.hasOwnProperty('API_AUTH_CODE')) {
        done();
        return
    }
    if (request.url.startsWith('/config/')) {
        let cf_path = request.url.slice(8).split('?')[0];
        // console.log(cf_path);
        if (!['index.js', 'index.js.md5', 'index.config.js', 'index.config.js.md5'].includes(cf_path)) {
            done();
            return
        }
        console.log(`[validateBasicAuth] 猫配置文件 ${cf_path} 进入Basic登录鉴权`);
    }
    // console.log('进入了basic验证');
    const authHeader = request.headers.authorization;

    if (!authHeader) {
        reply.header('WWW-Authenticate', 'Basic');
        return reply.code(401).send('Authentication required');
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    const validUsername = process.env.API_AUTH_NAME || '';
    const validPassword = process.env.API_AUTH_CODE || '';

    if (username === validUsername && password === validPassword) {
        done(); // 验证通过，继续处理请求
    } else {
        reply.header('WWW-Authenticate', 'Basic');
        return reply.code(401).send('Invalid credentials');
    }
};

// 接口密码验证
export const validatePwd = async (request, reply) => {
    const apiPwd = process.env.API_PWD;
    if (!apiPwd) {
        return; // 如果未配置 API_PWD，直接通过
    }
    if (request.url.startsWith('/config/')) {
        let cf_path = request.url.slice(8).split('?')[0];
        // console.log(cf_path);
        if (['index.js', 'index.js.md5', 'index.config.js', 'index.config.js.md5'].includes(cf_path)) {
            console.log(`[validatePwd] 猫配置文件 ${cf_path} 跳过接口密码鉴权`);
            return
        }
    }

    // 从查询参数或请求体中获取 pwd
    const pwd = request.query.pwd || request.body?.pwd;

    // 如果 pwd 不存在或与 API_PWD 不匹配，返回 403
    if (pwd !== apiPwd) {
        return reply.code(403).send({error: 'Forbidden: Invalid or missing pwd'});
    }
};


// JS文件验证
export const validateJs = async (request, reply, dr2Dir) => {
    if (request.url.startsWith('/js/')) {
        try {
            const fileName = decodeURIComponent(request.url.replace('/js/', '').split('?')[0]);
            // console.log('fileName', fileName);
            // 获取文件系统路径
            const filePath = path.join(dr2Dir, fileName);
            // console.log('filePath', filePath);

            // 读取文件内容
            let content = await readFile(filePath, 'utf8');
            if (/var rule|function|let |var |const|class Rule|async|this\./.test(content)) {
                // 添加版权信息
                const copyright = `/*!
 * Copyright © ${new Date().getFullYear()} Taoist
 * Licensed under LGPL3 (https://github.com/hjdhnx/drpy-node/blob/main/LICENSE)
 */
`;
                content = `${copyright}${content}`;
            } else {
                content = await fileHeaderManager.removeHeader(content, {
                    mode: 'top-comments',
                    fileType: '.js'
                });
            }

            // 设置响应头并发送修改后的内容
            return reply
                .header('Content-Type', 'application/javascript; charset=utf-8')
                .send(content);

        } catch (error) {
            // 文件不存在时继续后续处理（由fastify-static处理404）
            if (error.code === 'ENOENT') return;

            // 其他错误处理
            console.error(`File processing error: ${error.message}`);
            return reply.code(500).send('Internal Server Error');
        }
    }
}