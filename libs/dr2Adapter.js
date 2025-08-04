/**
 * drpy2.js - T3脚本服务端解析引擎
 * 基于drpy2.min.js的官方实现，提供与drpyS相同的API接口
 * 专门用于解析T3类型脚本
 * 
 * @version 1.0.0
 * @author drpy2 team
 */

import {readFile} from 'fs/promises';
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'fs';
import {fileURLToPath} from 'url';
import path, { join } from 'path';
import vm from 'vm';

// === 导入依赖库 ===
import '../libs_drpy/es6-extend.js';
import * as utils from '../utils/utils.js';
import {ENV} from '../utils/env.js';
import {base64Decode, base64Encode, md5} from '../libs_drpy/crypto-util.js';
import '../libs_drpy/drpyInject.js';
import '../libs_drpy/crypto-js.js';
import '../libs_drpy/jsencrypt.js';
import '../libs_drpy/pako.min.js';
import '../libs_drpy/json5.js';
import "../libs_drpy/jinja.js";
import '../libs_drpy/moduleLoader.js';
import template from '../libs_drpy/template.js';
import '../libs_drpy/drpyCustom.js';
import {jsonpath, jsoup} from '../libs_drpy/htmlParser.js';
import {evalFetch as fetch,req,request} from './drpy2_Inject.js';    

// 全局化同步fetch函数,替换掉异步fetch
globalThis.fetch = fetch;
globalThis.req = req;
// === 基础配置和常量 ===
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const {sleep, sleepSync, deepCopy, getNowTime, urljoin,urljoin2,joinUrl,naturalSort,$js,keysToLowerCase} = utils;
const {log} = console;

// 读取扩展代码 - 优化：启动时异步初始化，避免同步堵塞
const es6JsPath = path.join(__dirname, '../libs_drpy/es6-extend.js');
const reqJsPath = path.join(__dirname, '../libs_drpy/req-extend.js');

// 使用预读取的代码内容，避免每次getSandbox都要读取
const es6_extend_code = readFileSync(es6JsPath, 'utf8');
const req_extend_code = readFileSync(reqJsPath, 'utf8');

globalThis.cheerio = {};
globalThis.cheerio.jp = function(path, jsonObject) {
    try {
        // 优先使用全局JSONPath
        if (typeof globalThis.JSONPath !== 'undefined' && globalThis.JSONPath.JSONPath) {
            return globalThis.JSONPath.JSONPath({path: path, json: jsonObject});
        } 
    } catch (e) {
        log(`cheerio.jp执行错误: ${e.message}`);
        return [];
    }
};

// 批量定义全局变量
function defineGlobalVariables() {
    const variables = {
        VODS: [],
        VOD: {},
        TABS: [],
        LISTS: [],
        MY_FL: {},
        MY_CATE: ''
    };
    
    Object.entries(variables).forEach(([name, defaultValue]) => {
        // 只有当全局对象上不存在该属性时才定义
        if (!Object.prototype.hasOwnProperty.call(globalThis, name)) {
            let privateValue = defaultValue;
            Object.defineProperty(globalThis, name, {
                get() { return privateValue; },
                set(v) { privateValue = v; },
                configurable: true,
                enumerable: true
            });
        }
    });
}
// 初始化全局变量
defineGlobalVariables();

// 常量已在drpyCustom.js中定义，这里只需要引用
const CONSTANTS = {
    CATE_EXCLUDE: globalThis.CATE_EXCLUDE,
    TAB_EXCLUDE: globalThis.TAB_EXCLUDE, 
    OCR_RETRY: globalThis.OCR_RETRY,
    OCR_API: globalThis.OCR_API,
    SPECIAL_URL: globalThis.SPECIAL_URL,
    NO_DATA: globalThis.nodata || {
        list: [{
            vod_name: '无数据,防无限请求',
            vod_id: 'no_data',
            vod_remarks: '不要点,会崩的',
            vod_pic: 'https://ghproxy.net/https://raw.githubusercontent.com/hjdhnx/dr_py/main/404.jpg'
        }],
        total: 1, pagecount: 1, page: 1, limit: 1
    }
};

// 全局变量
let HOST = '';
let RKEY = '';
let rule_fetch_params = {};
let fetch_params = {};
// 自动全局化MY_URL，兼容所有赋值和作用域
if (typeof globalThis.MY_URL === 'undefined') {
    Object.defineProperty(globalThis, 'MY_URL', {
        get() { return globalThis._MY_URL; },
        set(v) { globalThis._MY_URL = v; },
        configurable: true,
        enumerable: true
    });
}

// 自动全局化MY_FL，兼容所有赋值和作用域
if (typeof globalThis.MY_FL === 'undefined') {
    Object.defineProperty(globalThis, 'MY_FL', {
        get() { return globalThis._MY_FL; },
        set(v) { globalThis._MY_FL = v; },
        configurable: true,
        enumerable: true
    });
}

// 自动全局化MY_CATE，兼容所有赋值和作用域
if (typeof globalThis.MY_CATE === 'undefined') {
    Object.defineProperty(globalThis, 'MY_CATE', {
        get() { return globalThis._MY_CATE; },
        set(v) { globalThis._MY_CATE = v; },
        configurable: true,
        enumerable: true
    });
}

// 模块缓存 - 增加大小限制，避免内存泄漏
const moduleCache = new Map();
let homeHtmlCache = '';
let _pdfa, _pdfh, _pd; // 全局解析函数

// === 初始化模块 ===

/**
 * 初始化全局环境
 */
function initGlobalEnvironment() {
    // 设置全局模板
    globalThis.muban = template.muban;
    
    // 创建HTML解析函数实例并绑定方法
    const jsoupInstance = new jsoup();
    const pdfh = jsoupInstance.pdfh.bind(jsoupInstance);
    const pdfa = jsoupInstance.pdfa.bind(jsoupInstance);
    const pd = jsoupInstance.pd.bind(jsoupInstance);
    
    // 挂载解析函数到全局
    if (!globalThis.pdfh) globalThis.pdfh = pdfh;
    if (!globalThis.pdfa) globalThis.pdfa = pdfa;
    if (!globalThis.pd) globalThis.pd = pd;
    if (!globalThis.jsp) {
        globalThis.jsp = createSafeJsoup(jsoupInstance);
    }
    if (!globalThis.dealJson) globalThis.dealJson = dealJson;
    if (!globalThis.parseTags) globalThis.parseTags = parseTags;
    if (!globalThis.urljoin) globalThis.urljoin = urljoin;
    if (!globalThis.urljoin2) globalThis.urljoin2 = urljoin2;
    if (!globalThis.joinUrl) globalThis.joinUrl = joinUrl;
    
    // 挂载安全的JSON解析函数到全局
    if (!globalThis.safeEval) globalThis.safeEval = safeEval;
    // 保存原始的JSON.parse，并替换为安全版本（可选，谨慎使用）
}
initGlobalEnvironment();
/**
 * 加载WASM模块
 */
async function loadWASMModules() {
    try {
        if (!globalThis.CryptoJSW) {
            await import('../libs_drpy/crypto-js-wasm.js');
            globalThis.CryptoJSW = CryptoJSWasm;
        }
        log('WASM模块加载成功');
    } catch (error) {
        log(`WASM模块加载失败: ${error.message}`);
        globalThis.CryptoJSW = {
            loadAllWasm: async () => {},
            ...globalThis.CryptoJS
        };
    }
}

// === 工具函数模块 ===

/**
 * 计算文件哈希值
 */
function computeHash(content) {
    return md5(content);
}

// gzip解压缩函数已在drpyCustom.js中定义为globalThis.ungzip

/**
 * 辅助函数 getPP
 */
function getPP(p, pn, pp, ppn) {
    try {
        return p[pn] === '*' && pp.length > ppn ? pp[ppn] : p[pn];
    } catch (e) {
        return '';
    }
}

/**
 * 时间统计工具
 */
function createTimer(label) {
    const startTime = Date.now();
    return () => {
        const cost = Date.now() - startTime;
        console.log(`${label}耗时:${cost}毫秒`);
        return cost;
    };
}

/**
 * 安全的JavaScript执行函数 - 增强版
 * 在执行过程中临时替换JSON.parse为安全版本
 */
function safeEval(code, context = {}) {
    try {
        // 确保关键变量存在
        if (!globalThis.VOD) globalThis.VOD = {};
        if (!globalThis.VODS) globalThis.VODS = [];
        if (!globalThis.TABS) globalThis.TABS = [];
        if (!globalThis.LISTS) globalThis.LISTS = [];
        
        // 将上下文变量注入到全局
        const originalVars = {};
        for (const [key, value] of Object.entries(context)) {
            originalVars[key] = globalThis[key];
            globalThis[key] = value;
        }
        
        try {
            return eval(code);
        } finally {
            // 恢复原始上下文变量
            for (const [key, originalValue] of Object.entries(originalVars)) {
                if (originalValue === undefined) {
                    delete globalThis[key];
                } else {
                    globalThis[key] = originalValue;
                }
            }
        }
    } catch (e) {
        console.error(`脚本执行错误: ${e.message}`, e.stack);
        // 不抛出错误，保证流程继续
        return null;
    }
}

/**
 * 创建安全的字符串对象 - 解决null调用字符串方法的问题
 * 当DOM查询返回null/undefined时，提供安全的字符串方法
 */
function createSafeString(value) {
    if (value === null || value === undefined) {
        // 返回一个模拟字符串对象，包含常用的字符串方法
        return {
            toString: () => '',
            valueOf: () => '',
            replace: () => '',
            split: () => [''],
            substr: () => '',
            substring: () => '',
            indexOf: () => -1,
            includes: () => false,
            startsWith: () => false,
            endsWith: () => false,
            toLowerCase: () => '',
            toUpperCase: () => '',
            trim: () => '',
            length: 0,
            // 让它在字符串上下文中表现为空字符串
            [Symbol.toPrimitive]: () => '',
            // 确保直接使用时返回空字符串
            [Symbol.toString]: () => ''
        };
    }
    return value;
}

/**
 * 创建安全的JSON对象 - 解决访问undefined属性的问题
 * 当访问不存在的属性时，返回安全的默认值而不是抛出错误
 */
function createSafeJsonProxy(obj) {
    if (obj === null || obj === undefined) {
        // 如果对象本身就是null/undefined，返回一个安全的代理
        return new Proxy({}, {
            get(target, prop) {
                if (prop === 'data' || typeof prop === 'string') {
                    return createSafeJsonProxy({});
                }
                return undefined;
            }
        });
    }
    
    if (typeof obj !== 'object') {
        return obj;
    }
    
    return new Proxy(obj, {
        get(target, prop) {
            const value = target[prop];
            if (value === null || value === undefined) {
                // 如果属性不存在或为null/undefined，返回安全的代理对象
                if (prop === 'data' || typeof prop === 'string') {
                    return createSafeJsonProxy({});
                }
                return undefined;
            }
            
            // 如果是对象，递归包装
            if (typeof value === 'object' && value !== null) {
                return createSafeJsonProxy(value);
            }
            
            return value;
        }
    });
}

/**
 * 安全的DOM查询包装器
 */
function createSafeJsoup(jsoupInstance) {
    return {
        pdfh: (html, parse, baseUrl) => {
            const result = jsoupInstance.pdfh(html, parse, baseUrl);
            return createSafeString(result);
        },
        pdfa: (html, parse) => {
            const result = jsoupInstance.pdfa(html, parse);
            return result || [];
        },
        pd: (html, parse, baseUrl) => {
            const result = jsoupInstance.pd(html, parse, baseUrl);
            return createSafeString(result);
        },
        pq: jsoupInstance.pq.bind(jsoupInstance),
        pj: jsoupInstance.pj.bind(jsoupInstance),
        pjfa: jsoupInstance.pjfa.bind(jsoupInstance),
        pjfh: jsoupInstance.pjfh.bind(jsoupInstance),
    };
}

/**
 * 通用URL处理函数
 * @param {string} url - 要处理的URL
 * @param {string} host - 主机地址
 * @param {boolean} hasArray - 是否包含数组形式的URL
 * @returns {string} - 处理后的URL
 */
function processRuleUrl(url, host, hasArray = false) {
    if (!url || !host) return url;
    if (hasArray && url.includes('[') && url.includes(']')) {
        let u1 = url.split('[')[0];
        let u2 = url.split('[')[1].split(']')[0];
        return urljoin(host, u1) + '[' + urljoin(host, u2) + ']';
    }
    return urljoin(host, url);
}

/**
 * 通用图片处理函数 (优化性能)
 */
function processImages(vodList, rule) {
    if (!Array.isArray(vodList) || !rule) return vodList;
    
    // 提前检查是否需要处理，避免不必要的遍历
    if (!rule.图片替换 && !rule.图片来源) return vodList;
    
    try {
        // 图片替换处理
        if (rule.图片替换) {
            if (rule.图片替换.startsWith("js:")) {
                // 限制处理的数量，避免大数组影响性能
                const maxProcessCount = Math.min(vodList.length, 1000);
                for (let i = 0; i < maxProcessCount; i++) {
                    const it = vodList[i];
                    try {
                        var input = it.vod_pic;
                        // 确保 jsp 对象可用，并正确绑定方法
                        const jsoupInstance = new jsoup();
                        globalThis.jsp = createSafeJsoup(jsoupInstance);
                        
                        safeEval(rule.图片替换.trim().replace("js:", ""));
                        it.vod_pic = input;
                    } catch (e) {
                        log(`图片:${it.vod_pic}替换错误:${e.message}`);
                    }
                }
            } else if (rule.图片替换.includes("=>")) {
                let [replace_from, replace_to] = rule.图片替换.split("=>");
                vodList.forEach((it) => {
                    if (it.vod_pic && it.vod_pic.startsWith("http")) {
                        it.vod_pic = it.vod_pic.replace(replace_from, replace_to);
                    }
                });
            }
        }

        // 图片来源处理
        if (rule.图片来源) {
            vodList.forEach((it) => {
                if (it.vod_pic && it.vod_pic.startsWith("http")) {
                    it.vod_pic = it.vod_pic + rule.图片来源;
                }
            });
        }
    } catch (e) {
        log(`图片处理过程中出现错误: ${e.message}`);
    }
    return vodList;
}

/**
 * 通用返回值处理函数
 */
function parseJsonResult(result) {
    if (typeof result === 'string') {
        try {
            return JSON.parse(result);
        } catch (e) {
            log(`JSON解析失败: ${e.message}`);
            return result;
        }
    }
    return result;
}

/**
 * 通用HTTP请求处理函数
 */
function makeRequest(url, options = {}) {
    try {
        const { method = 'get', postData = '', headers = {} } = options;
        const requestHeaders = { ...fetch_params.headers, ...headers };
        
        if (method.toLowerCase() === 'post') {
            return globalThis.post(url, { 
                body: postData, 
                headers: requestHeaders 
            });
        } else if (method.toLowerCase() === 'postjson') {
            try {
                const jsonData = typeof postData === 'string' ? JSON.parse(postData) : postData;
                return globalThis.post(url, { 
                    body: JSON.stringify(jsonData), 
                    headers: { ...requestHeaders, 'Content-Type': 'application/json' }
                });
            } catch (e) {
                return globalThis.post(url, { 
                    body: postData, 
                    headers: { ...requestHeaders, 'Content-Type': 'application/json' }
                });
            }
        } else {
            return globalThis.getHtml(url);
        }
    } catch (e) {
        log(`请求失败: ${e.message}`);
        return '';
    }
}

/**
 * 搜索关键词编码处理函数
 */
function processEncoding(wd, rule) {
    try {
        if (rule.search_encoding && rule.search_encoding.toLowerCase() !== 'utf-8') {
            return encodeURIComponent(wd);
        }
        return wd;
    } catch (e) {
        log(`搜索编码处理失败: ${e.message}`);
        return wd;
    }
}

/**
 * 初始化请求参数
 */
function initFetchParams() {
    fetch_params = deepCopy(rule_fetch_params);
    if (!fetch_params) fetch_params = {};
    if (!fetch_params.headers) fetch_params.headers = {};
}

/**
 * 创建沙箱环境 - 优化为与drpyS.js相似的高效模式
 */
async function getSandbox(env = {}) {
    const { getProxyUrl, hostUrl, fServer } = env;
    
    // 加载WASM模块
    await loadWASMModules();
    
    // 工具函数沙箱 - 直接使用已有变量，避免globalThis解构
    const utilsSanbox = {
        sleep, sleepSync, utils, misc: globalThis.misc, computeHash, deepCopy,
        urljoin, urljoin2, joinUrl, naturalSort, $js,
        $: globalThis.$ || {}, getNowTime, getProxyUrl, hostUrl, fServer
    };

    // drpy功能沙箱 - 直接引用全局函数
    const drpySanbox = {
        pdfh: globalThis.pdfh, pdfa: globalThis.pdfa, pd: globalThis.pd,
        pjfh: globalThis.pjfh, pjfa: globalThis.pjfa, pj: globalThis.pj,
        jsoup: globalThis.jsoup, req: globalThis.req, _fetch: globalThis._fetch,
        request: globalThis.request, post: globalThis.post, fetch,
        getCode: globalThis.getCode, getHtml: globalThis.getHtml, 
        local: globalThis.local, log, print: console.log
    };

    // 自定义功能沙箱 - 避免重复解构
    const drpyCustomSanbox = {
        MOBILE_UA: globalThis.MOBILE_UA, PC_UA: globalThis.PC_UA,
        UC_UA: globalThis.UC_UA, IOS_UA: globalThis.IOS_UA, UA: globalThis.UA,
        RULE_CK: globalThis.RULE_CK || 'cookie',
        ...CONSTANTS,
        setResult: globalThis.setResult, setResult2: globalThis.setResult2,
        setHomeResult: globalThis.setHomeResult, dealJson: globalThis.dealJson,
        urlDeal: globalThis.urlDeal, tellIsJx: globalThis.tellIsJx,
        urlencode: globalThis.urlencode, encodeUrl: globalThis.encodeUrl,
        getHome: globalThis.getHome, buildUrl: globalThis.buildUrl,
        parseQueryString: globalThis.parseQueryString,
        objectToQueryString: globalThis.objectToQueryString,
        encodeIfContainsSpecialChars: globalThis.encodeIfContainsSpecialChars,
        base64Encode: globalThis.base64Encode, base64Decode: globalThis.base64Decode,
        md5: globalThis.md5, uint8ArrayToBase64: globalThis.uint8ArrayToBase64,
        Utf8ArrayToStr: globalThis.Utf8ArrayToStr, gzip: globalThis.gzip,
        ungzip: globalThis.ungzip, encodeStr: globalThis.encodeStr,
        decodeStr: globalThis.decodeStr, getCryptoJS: globalThis.getCryptoJS,
        RSA: globalThis.RSA, fixAdM3u8Ai: globalThis.fixAdM3u8Ai,
        forceOrder: globalThis.forceOrder, getQuery: globalThis.getQuery,
        stringify: globalThis.stringify || JSON.stringify,
        OcrApi: globalThis.OcrApi, keysToLowerCase: globalThis.keysToLowerCase,
        rc: globalThis.rc, maoss: globalThis.maoss, parseTags: globalThis.parseTags
    };

    // 第三方库沙箱
    const libsSanbox = {
        CryptoJS: globalThis.CryptoJS, CryptoJSW: globalThis.CryptoJSW,
        JSEncrypt: globalThis.JSEncrypt, pako: globalThis.pako,
        JSON5: globalThis.JSON5, jinja, template: globalThis.template,
        axios: globalThis.axios, Buffer: globalThis.Buffer,
        URL: globalThis.URL, URLSearchParams: globalThis.URLSearchParams,
        cheerio: globalThis.cheerio, jsonpath: globalThis.jsonpath,
        ENV: globalThis.ENV
    };

    // 创建沙箱 - 参照drpyS.js的简洁设计
    const sandbox = {
        console, WebAssembly, setTimeout, setInterval, clearTimeout, clearInterval,
        TextEncoder, TextDecoder, performance, module: {}, exports: {},
        rule: {}, _asyncGetRule: null,
        ...utilsSanbox, ...drpySanbox, ...drpyCustomSanbox, ...libsSanbox
    };

    // 创建VM上下文
    const context = vm.createContext(sandbox);
    
    // 注入ES6扩展
    try {
        const polyfillsScript = new vm.Script(es6_extend_code);
        polyfillsScript.runInContext(context);
    } catch (e) {
        log(`ES6扩展注入失败: ${e.message}`);
    }
    
    // 注入req-extend代码 - 这是关键步骤，不能删除！
    try {
        const reqExtendScript = new vm.Script(req_extend_code);
        reqExtendScript.runInContext(context);
        sandbox.request = request;
        globalThis.request = request;
        
        // 提升关键函数到全局和沙箱
        const funcNames = ['getHtml', 'request', 'post', 'getCode', 'setItem', 'getItem', 'clearItem', 'getHome', 'buildUrl', 'verifyCode'];
        funcNames.forEach(funcName => {
            if (sandbox[funcName] && typeof sandbox[funcName] === 'function') {
                globalThis[funcName] = sandbox[funcName];
            }
        });
        
        // 确保从全局环境复制函数到沙箱
        const globalFuncNames = ['getHome', 'buildUrl', 'parseQueryString', 'encodeIfContainsSpecialChars', 'objectToQueryString', '$require'];
        globalFuncNames.forEach(funcName => {
            if (globalThis[funcName] && typeof globalThis[funcName] === 'function') {
                sandbox[funcName] = globalThis[funcName];
            }
        });

    } catch (e) {
        log(`req-extend代码注入失败: ${e.message}`);
    }

    // 设置模块加载器
    try {
        if (globalThis.$ && typeof globalThis.$.setSandbox === 'function') {
            sandbox.$ = globalThis.$;
            sandbox.$.setSandbox(sandbox);
        }
    } catch (e) {
        log(`模块加载器设置失败: ${e.message}`);
    }

    return { sandbox, context };
}

// dealJson函数已在drpyCustom.js中定义为globalThis.dealJson

/**
 * 验证码处理函数
 */
function verifyCode(url) {
    try {
        return '';
    } catch (e) {
        log(`验证码处理失败: ${e.message}`);
        return '';
    }
}

/**
 * vodDeal函数 - 处理播放源排序和重命名 (优化性能)
 */
function vodDeal(vod, rule) {
    if (!vod || !rule) return vod;
    
    try {
        // 线路排序
        if (rule.tab_order && rule.tab_order.length > 0 && vod.vod_play_from) {
            let froms = vod.vod_play_from.split('$$$');
            let urls = vod.vod_play_url ? vod.vod_play_url.split('$$$') : [];
            
            let orderedFroms = [];
            let orderedUrls = [];
            
            // 按照tab_order顺序排列
            rule.tab_order.forEach((orderItem) => {
                let index = froms.findIndex(from => from.includes(orderItem));
                if (index !== -1) {
                    orderedFroms.push(froms[index]);
                    if (urls[index]) {
                        orderedUrls.push(urls[index]);
                    }
                    froms.splice(index, 1);
                    urls.splice(index, 1);
                }
            });
            
            // 添加剩余的
            orderedFroms = orderedFroms.concat(froms);
            orderedUrls = orderedUrls.concat(urls);
            
            vod.vod_play_from = orderedFroms.join('$$$');
            vod.vod_play_url = orderedUrls.join('$$$');
        }
        
        // 线路重命名 - 优化性能，减少不必要的循环
        if (rule.tab_rename && Object.keys(rule.tab_rename).length > 0 && vod.vod_play_from) {
            let froms = vod.vod_play_from.split('$$$');
            // 预编译所有重命名规则为数组，提高查找效率
            const renameEntries = Object.entries(rule.tab_rename);
            froms = froms.map(from => {
                for (const [key, value] of renameEntries) {
                    if (from.includes(key)) {
                        return from.replace(key, value);
                    }
                }
                return from;
            });
            vod.vod_play_from = froms.join('$$$');
        }
        
        // 移除指定线路 - 优化性能，使用 Set 提高查找效率
        if (rule.tab_remove && rule.tab_remove.length > 0 && vod.vod_play_from) {
            let froms = vod.vod_play_from.split('$$$');
            let urls = vod.vod_play_url ? vod.vod_play_url.split('$$$') : [];
            
            // 将移除项转为Set，提高查找性能
            const removeSet = new Set(rule.tab_remove);
            
            // 从后往前遍历，安全删除元素
            for (let i = froms.length - 1; i >= 0; i--) {
                let shouldRemove = false;
                for (const removeItem of removeSet) {
                    if (froms[i].includes(removeItem)) {
                        shouldRemove = true;
                        break;
                    }
                }
                if (shouldRemove) {
                    froms.splice(i, 1);
                    urls.splice(i, 1);
                }
            }
            
            vod.vod_play_from = froms.join('$$$');
            vod.vod_play_url = urls.join('$$$');
        }
        
        // 过滤线路名称 - 预编译正则表达式，避免重复创建
        if (rule.tab_exclude && vod.vod_play_from) {
            let froms = vod.vod_play_from.split('$$$');
            let urls = vod.vod_play_url ? vod.vod_play_url.split('$$$') : [];
            const excludeRegex = new RegExp(rule.tab_exclude);
            
            for (let i = froms.length - 1; i >= 0; i--) {
                if (excludeRegex.test(froms[i])) {
                    froms.splice(i, 1);
                    urls.splice(i, 1);
                }
            }
            
            vod.vod_play_from = froms.join('$$$');
            vod.vod_play_url = urls.join('$$$');
        }
        
    } catch (e) {
        console.log(`vodDeal处理错误:${e.message}`);
    }
    
    return vod;
}

// === 解析逻辑模块 ===

/**
 * 首页解析 (完整实现) - 优化正则表达式性能
 */
async function homeParse(homeObj) {
    initFetchParams();
    let classes = [];
    
    // 预编译正则表达式，避免重复创建
    const cateExcludeRegex = homeObj.cate_exclude ? new RegExp(homeObj.cate_exclude) : null;
    
    if (homeObj.class_name && homeObj.class_url) {
        let names = homeObj.class_name.split('&');
        let urls = homeObj.class_url.split('&');
        let cnt = Math.min(names.length, urls.length);
        for (let i = 0; i < cnt; i++) {
            classes.push({ type_id: urls[i], type_name: names[i] });
        }
    }
    if (homeObj.class_parse) {
        if (typeof homeObj.class_parse === 'function') {
            // 如果是函数，直接调用
            try {
                let result = await homeObj.class_parse();
                if (Array.isArray(result)) {
                    classes = result;
                }
            } catch (e) {
                log(`调用class_parse函数失败: ${e.message}`);
            }
        } else if (typeof homeObj.class_parse === 'string' && homeObj.class_parse.startsWith('js:')) {
            var input = homeObj.MY_URL;
            try {
                // 确保 jsp 对象可用，并正确绑定方法
                const jsoupInstance = new jsoup();
                globalThis.jsp = createSafeJsoup(jsoupInstance);
                safeEval(homeObj.class_parse.replace('js:', ''));
                if (Array.isArray(input)) {
                    classes = input;
                }
            } catch (e) {
                log(`通过js动态获取分类发生了错误:${e.message}`);
            }
        } else {
            let p = homeObj.class_parse.split(';');
            let p0 = p[0];
            let _ps = parseTags.getParse(p0);
            let is_json = p0.startsWith('json:');
            _pdfa = _ps.pdfa;
            _pdfh = _ps.pdfh;
            _pd = _ps.pd;
            MY_URL = homeObj.MY_URL; // 添加缺失的MY_URL设置
            if (is_json) {
                try {
                    let cms_cate_url = homeObj.MY_URL.replace('ac=detail', 'ac=list');
                    let html = homeObj.home_html || await globalThis.getHtml(cms_cate_url);
                    if (html) {
                        if (cms_cate_url === homeObj.MY_URL) {
                            homeHtmlCache = html; // 添加缺失的homeHtmlCache处理
                        }
                        html = dealJson(html);
                        let list = _pdfa(html, p0.replace('json:', ''));
                        if (list && list.length > 0) {
                            classes = list;
                        }
                    }
                } catch (e) {
                    console.log(e.message);
                }
            } else if (p.length >= 3 && !is_json) {
                try {
                    let html = homeObj.home_html || await globalThis.getHtml(homeObj.MY_URL);
                    if (html) {
                        homeHtmlCache = html; // 添加缺失的homeHtmlCache处理
                        let list = _pdfa(html, p0);
                        if (list && list.length > 0) {
                            // 预编译可能的正则表达式，避免在循环中重复创建
                            const urlRegex = p.length > 3 && p[3] && !homeObj.home_html ? new RegExp(p[3]) : null;
                            
                            list.forEach((it, idex) => {
                                try {
                                    let name = _pdfh(it, p[1]);
                                    if (cateExcludeRegex && cateExcludeRegex.test(name)) {
                                        return;
                                    }
                                    let url = _pd(it, p[2]);
                                    if (urlRegex) {
                                        url = url.match(urlRegex)[1];
                                    }
                                    classes.push({ type_id: url.trim(), type_name: name.trim() });
                                } catch (e) {
                                    console.log(`分类列表定位第${idex}个元素正常报错:${e.message}`);
                                }
                            });
                        }
                    }
                } catch (e) {
                    log(e.message);
                }
            }
        }
    }
    // 使用预编译的正则表达式
    classes = classes.filter(
        (it) => !cateExcludeRegex || !cateExcludeRegex.test(it.type_name)
    );
    let resp = { class: classes };
    if (homeObj.filter) {
        resp.filters = homeObj.filter;
    }
    // 优化日志输出，避免大对象序列化影响性能
    console.log(`首页解析完成，共${classes.length}个分类`);
    return resp;
}

/**
 * 推荐内容解析 (完整实现)
 */
async function homeVodParse(homeVodObj, rule) {
    const timer = createTimer('加载首页推荐');
    initFetchParams();
    let d = [];
    let MY_URL = homeVodObj.homeUrl;
    let p = homeVodObj.推荐;
    if (p === '*' && homeVodObj.一级) {
        p = homeVodObj.一级;
        homeVodObj.double = false;
    }
    if (!p || typeof p !== 'string') {
        return "{}";
    }
    p = p.trim();
    let pp = homeVodObj.一级 ? homeVodObj.一级.split(';') : [];
    if (p.startsWith('js:')) {
        const TYPE = 'home';
        var input = MY_URL;
        HOST = homeVodObj.host;
        // 重置VODS，确保干净的执行环境
        globalThis.VODS = [];
        // 确保 jsp 对象可用，并正确绑定方法
        const jsoupInstance = new jsoup();
        globalThis.jsp = createSafeJsoup(jsoupInstance);
        
        safeEval(p.replace('js:', ''));
        
        // 获取脚本执行后的结果
        d = globalThis.VODS && globalThis.VODS.length > 0 ? globalThis.VODS : d;
    } else {
        p = p.split(';');
        if (!homeVodObj.double && p.length < 5) {
            return "{}";
        }else if (homeVodObj.double && p.length < 6) {
          return "{}";
        }
        let p0 = getPP(p, 0, pp, 0);
        let _ps = parseTags.getParse(p0);
        _pdfa = _ps.pdfa;
        _pdfh = _ps.pdfh;
        _pd = _ps.pd;
        let is_json = p0.startsWith('json:');
        p0 = p0.replace(/^(jsp:|json:|jq:)/, '');
        let html = homeVodObj.home_html || await globalThis.getHtml(MY_URL);
        //console.log(`首页推荐解析URL:${MY_URL},html:`,html);
        if (is_json) {
            html = dealJson(html);
        }
        try {
            if (homeVodObj.double) {
                let items = _pdfa(html, p0);
                let p1 = p[1];
                let p2 = getPP(p, 2, pp, 1);
                let p3 = getPP(p, 3, pp, 2);
                let p4 = getPP(p, 4, pp, 3);
                let p5 = getPP(p, 5, pp, 4);
                let p6 = getPP(p, 6, pp, 5);
                for (let item of items) {
                    let items2 = _pdfa(item, p1);
                    for (let item2 of items2) {
                        try {
                            let title = _pdfh(item2, p2);
                            let img = '';
                            try { img = _pd(item2, p3); } catch (e) {}
                            let desc = '';
                            try { desc = _pdfh(item2, p4); } catch (e) {}
                            let links = [];
                            for (let _p5 of p5.split('+')) {
                                let link = !homeVodObj.detailUrl ? _pd(item2, _p5, MY_URL) : _pdfh(item2, _p5);
                                links.push(link);
                            }
                             let content;
                             if (p.length > 6 && p[6]) {
                                 content = _pdfh(item2, p6);
                             } else {
                                 content = "";
                             }
                            let vid = links.join('$');
                            if (rule.二级 === "*") {
                                vid = vid + "@@" + title + "@@" + img;
                            }
                            d.push({vod_name: title, vod_pic: img, vod_remarks: desc,vod_content: content,vod_id: vid});
                        } catch (e) {console.log(`首页列表双层定位处理发生错误:${e.message}`);}
                    }
                }
            } else {
                let items = _pdfa(html, p0);
                let p1 = getPP(p, 1, pp, 1);
                let p2 = getPP(p, 2, pp, 2);
                let p3 = getPP(p, 3, pp, 3);
                let p4 = getPP(p, 4, pp, 4);
                let p5 = getPP(p, 5, pp, 5);
                for (let item of items) {
                    try {
                        let title = _pdfh(item, p1);
                        let img = '';
                        try { img = _pd(item, p2, MY_URL); } catch (e) {}
                        let desc = '';
                        try { desc = _pdfh(item, p3); } catch (e) {}
                        let links = [];
                        for (let _p5 of p4.split('+')) {
                            let link = !homeVodObj.detailUrl ? _pd(item, _p5, MY_URL) : _pdfh(item, _p5);
                            links.push(link);
                        }
                        let content = p.length > 5 && p[5] ? _pdfh(item, p5) : '';
                        let vid = links.join('$');
                        if (rule.二级 === "*") {
                            vid = vid + "@@" + title + "@@" + img;
                        }
                        d.push({ vod_name: title, vod_pic: img, vod_remarks: desc, vod_content: content,vod_id: vid });
                    } catch (e) { console.log(`首页列表单层定位发生错误:${e.message}`);}
                }
            }
        } catch (e) {}
    }
    // 使用通用图片处理函数
    d = processImages(d, rule);
    timer();
    // 结果预览打印
    if (d.length > 0) {
       // print(d.slice(0, 2));
    }
    return JSON.stringify({ list: d });
}

/**
 * 分类内容解析
 */
async function categoryParse(cateObj, rule) {
    log(`category`);
    const timer = createTimer('加载分类');
    
    // 确保rule_fetch_params正确设置，包含rule的headers、timeout等
    rule_fetch_params = {
        headers: rule.headers || {},
        timeout: rule.timeout || 5000,
        encoding: rule.encoding || 'utf8'
    };
    
    console.log(`[categoryParse] rule_fetch_params设置为:`, JSON.stringify(rule_fetch_params, null, 2));
    
    // 初始化fetch_params
    initFetchParams();
    
    console.log(`[categoryParse] fetch_params初始化后:`, JSON.stringify(fetch_params, null, 2));
    
    let p = cateObj.一级;
    
    if (!p || typeof p !== 'string') {
        return "{}";
    }
    let d = [];
    let url = cateObj.url.replaceAll('fyclass', cateObj.tid);
    if (cateObj.pg === 1 && url.includes('[') && url.includes(']')) {
        url = url.split('[')[1].split(']')[0];
    } else if (cateObj.pg > 1 && url.includes('[') && url.includes(']')) {
        url = url.split('[')[0];
    }
    if (rule.filter_url) {
        if (!/fyfilter/.test(url)) {
            if (!url.endsWith('&') && !rule.filter_url.startsWith('&')) {
                url += '&';
            }
            url += rule.filter_url;
        } else {
            url = url.replace('fyfilter', rule.filter_url);
        }
        url = url.replaceAll('fyclass', cateObj.tid);
        let fl = cateObj.filter ? cateObj.extend : {};
        if (rule.filter_def && typeof rule.filter_def === 'object') {
            try {
                if (Object.keys(rule.filter_def).length > 0 && rule.filter_def.hasOwnProperty(cateObj.tid)) {
                    let self_fl_def = rule.filter_def[cateObj.tid];
                    if (self_fl_def && typeof self_fl_def === 'object') {
                        let fl_def = JSON.parse(JSON.stringify(self_fl_def));
                        fl = Object.assign(fl_def, fl);
                    }
                }
            } catch (e) {
                log(`合并不同分类对应的默认筛选出错:${e.message}`);
            }
        }
        let new_url =jinja.render(url, { fl: fl, fyclass: cateObj.tid });
        url = new_url;
    }
    if (/fypage/.test(url)) {
        if (url.includes('(') && url.includes(')')) {
            let url_rep = url.match(/.*?\((.*)\)/)[1];
            let cnt_page = url_rep.replaceAll('fypage', cateObj.pg);
            // 避免直接使用eval，使用Function构造函数相对安全
            try {
                let cnt_pg = new Function('return ' + cnt_page)();
                url = url.replaceAll(url_rep, cnt_pg).replaceAll('(', '').replaceAll(')', '');
            } catch (e) {
                log(`页码计算表达式执行失败: ${e.message}`);
                // 回退到简单替换
                url = url.replaceAll('fypage', cateObj.pg);
            }
        } else {
            url = url.replaceAll('fypage', cateObj.pg);
        }
    }
    
     MY_URL = url;
    //console.log(`分类解析URL:${MY_URL}`);
    p = p.trim();
    // 按照drpy2.min.js的原始逻辑设置变量
    const MY_CATE = cateObj.tid;
    // 同时设置全局变量，确保脚本可以访问
    globalThis.MY_CATE = cateObj.tid;
    
    if (p.startsWith('js:')) {
        // 重置VODS，确保干净的执行环境
        globalThis.VODS = [];
        // 确保 jsp 对象可用，并正确绑定方法
        const jsoupInstance = new jsoup();
        globalThis.jsp = createSafeJsoup(jsoupInstance);
        // 保存原始的setResult函数
        const originalSetResult = globalThis.setResult;
        // 创建一个包装函数来捕获setResult的返回值
        globalThis.setResult = function(data) {
            const result = originalSetResult(data);
            globalThis.VODS = result; // 将转换后的结果赋值给VODS
            return result;
        };
        
        // 按照原始drpy2.min.js的逻辑，MY_FL作为局部变量在eval中使用
        var MY_FL = cateObj.extend;
        // 同时设置全局变量，确保脚本可以访问
        globalThis.MY_FL = cateObj.extend;
        
        const TYPE = "cate";
        var input = MY_URL;
        const MY_PAGE = cateObj.pg;
        var desc = "";
        
        // 确保fetch_params在执行上下文中可用
        globalThis.fetch_params = fetch_params;
        
        // 设置执行上下文，确保变量可用
        const context = {
            MY_FL: MY_FL,
            MY_CATE: MY_CATE,
            MY_PAGE: MY_PAGE,
            TYPE: TYPE,
            input: input,
            desc: desc,
            fetch_params: fetch_params
        };
        
        safeEval(p.trim().replace("js:", ""), context);
        
        // 恢复原始的setResult函数
        globalThis.setResult = originalSetResult;
        
        //console.log(`[DEBUG] JS执行后 - VODS长度: ${globalThis.VODS?.length || 0}, d长度: ${d?.length || 0}`);
        if (globalThis.VODS?.length > 0) {
            console.log(`[DEBUG] VODS第一项:`, globalThis.VODS[0]);
        }
        
        // 优先使用VODS，如果VODS为空则使用setResult的返回值
        d = globalThis.VODS && globalThis.VODS.length > 0 ? globalThis.VODS : d;
    } else {
        p = p.split(';');
        if (p.length < 5) {
            return "{}";
        }
        let _ps = parseTags.getParse(p[0]);
        _pdfa = _ps.pdfa;
        _pdfh = _ps.pdfh;
        _pd = _ps.pd;
        let is_json = p[0].startsWith('json:');
        p[0] = p[0].replace(/^(jsp:|json:|jq:)/, '');
        try {
          // 使用全局的完整getHtml函数（req-extend.js版本）
          let html = await globalThis.getHtml(MY_URL);
          if (html) {
            if (is_json) {
              html = dealJson(html);
            }

            let list = _pdfa(html, p[0]);
            list.forEach((it) => {
              try {
                let links = p[4].split("+").map((p4) => {
                  return !rule.detailUrl ? _pd(it, p4, MY_URL) : _pdfh(it, p4);
                });
                let link = links.join("$");
                let vod_id = rule.detailUrl ? MY_CATE + "$" + link : link;
                let vod_name = _pdfh(it, p[1]).replace(/\n|\t/g, "").trim();
                let vod_pic = _pd(it, p[2], MY_URL);

                if (rule.二级 === "*") {
                  vod_id = vod_id + "@@" + vod_name + "@@" + vod_pic;
                }
                d.push({
                  vod_id: vod_id,
                  vod_name: vod_name,
                  vod_pic: vod_pic,
                  vod_remarks: _pdfh(it, p[3]).replace(/\n|\t/g, "").trim(),
                });
              } catch (e) {
                console.log(`解析单个项目失败: ${e.message}`);
              }
            });
          }
        } catch (e) {
            // 静态分支解析异常处理
            console.log(`分类解析异常: ${e.message}`);
        }
    }
    // 使用通用图片处理函数
    d = processImages(d, rule);
    
    let pagecount = 0;
    if (rule.pagecount && typeof rule.pagecount === "object" && 
        rule.pagecount.hasOwnProperty(MY_CATE)) {
        pagecount = parseInt(rule.pagecount[MY_CATE]);
    }
    let nodata = CONSTANTS.NO_DATA;
    let vod = d.length < 1 ? JSON.stringify(nodata) : JSON.stringify({
        page: parseInt(cateObj.pg),
        pagecount: pagecount || 999,
        limit: Number(rule.limit) || 20,
        total: 999,
        list: d
    });

    timer();
    
    return vod;
}

/**
 * 详情解析 (完整实现) - 支持异步处理
 */
async function detailParse(detailObj, rule) {
    log(`detailParse`);
    log('oldID:', detailObj.orId);
    const timer = createTimer('加载二级详情页');
  initFetchParams();
  let orId = detailObj.orId;
  let vod_name = "片名";
  let vod_pic = "";
  let vod_id = orId;
  if (rule.二级 === "*") {
    let extra = orId.split("@@");
    vod_name = extra.length > 1 ? extra[1] : vod_name;
    vod_pic = extra.length > 2 ? extra[2] : vod_pic;
  }
  let vod = {
    vod_id: vod_id,
    vod_name: vod_name,
    vod_pic: vod_pic,
    type_name: "类型",
    vod_year: "年份",
    vod_area: "地区",
    vod_remarks: "更新信息",
    vod_actor: "主演",
    vod_director: "导演",
    vod_content: "简介",
  };
  let p = detailObj.二级;
  let url = detailObj.url;

  let detailUrl = detailObj.detailUrl;
  let fyclass = detailObj.fyclass;
  let tab_exclude = detailObj.tab_exclude;
  let html = detailObj.html || "";
  MY_URL = url;
  if (detailObj.二级访问前) {
    try {
      print(`尝试在二级访问前执行代码:${detailObj.二级访问前}`);
      eval(detailObj.二级访问前.trim().replace("js:", ""));
    } catch (e) {
      print(`二级访问前执行代码出现错误:${e.message}`);
    }
  }
  if (p === "*") {
    vod.vod_play_from = "道长在线";
    vod.vod_remarks = detailUrl;
    vod.vod_actor = "没有二级,只有一级链接直接嗅探播放";
    vod.vod_content = MY_URL;
    vod.vod_play_url = "嗅探播放$" + MY_URL.split("@@")[0];
  } else if (typeof p === "string" && p.trim().startsWith("js:")) {
    globalThis.fetch_params=fetch_params;
    // 确保 jsp 对象可用，并正确绑定方法
    const jsoupInstance = new jsoup();
    globalThis.jsp = createSafeJsoup(jsoupInstance);
    const TYPE = "detail";
    var input = MY_URL;
    var play_url = "";
    // 设置MY_FL为空对象，避免未定义错误
    globalThis.MY_FL = {};
    // 设置MY_CATE为空字符串，避免未定义错误  
    globalThis.MY_CATE = '';
    eval(p.trim().replace("js:", ""));
    vod = VOD;
    console.log("vod卡片",JSON.stringify(vod));
  } else if (p && typeof p === "object") {
    if (!html) {
      html = getHtml(MY_URL);
    }
   let _ps;
    if (p.is_json) {
      print("二级是json");
      _ps = parseTags.json;
      html = dealJson(html);
    } else if (p.is_jsp) {
      print("二级是jsp");
      _ps = parseTags.jsp;
    } else if (p.is_jq) {
      print("二级是jq");
      _ps = parseTags.jq;
    } else {
      print("二级默认jq");
      _ps = parseTags.jq;
    }
    let tt2 = new Date().getTime();
    _pdfa = _ps.pdfa;
    _pdfh = _ps.pdfh;
    _pd = _ps.pd;
    if (p.title) {
      let p1 = p.title.split(";");
      vod.vod_name = _pdfh(html, p1[0]).replace(/\n|\t/g, "").trim();
      let type_name =
        p1.length > 1
          ? _pdfh(html, p1[1]).replace(/\n|\t/g, "").replace(/ /g, "").trim()
          : "";
      vod.type_name = type_name || vod.type_name;
    }
    if (p.desc) {
      try {
        let p1 = p.desc.split(";");
        vod.vod_remarks = _pdfh(html, p1[0]).replace(/\n|\t/g, "").trim();
        vod.vod_year =
          p1.length > 1 ? _pdfh(html, p1[1]).replace(/\n|\t/g, "").trim() : "";
        vod.vod_area =
          p1.length > 2 ? _pdfh(html, p1[2]).replace(/\n|\t/g, "").trim() : "";
        vod.vod_actor =
          p1.length > 3 ? _pdfh(html, p1[3]).replace(/\n|\t/g, "").trim() : "";
        vod.vod_director =
          p1.length > 4 ? _pdfh(html, p1[4]).replace(/\n|\t/g, "").trim() : "";
      } catch (e) {}
    }
    if (p.content) {
      try {
        let p1 = p.content.split(";");
        vod.vod_content = _pdfh(html, p1[0]).replace(/\n|\t/g, "").trim();
      } catch (e) {}
    }
    if (p.img) {
      try {
        let p1 = p.img.split(";");
        vod.vod_pic = _pd(html, p1[0], MY_URL);
      } catch (e) {}
    }
    let vod_play_from = "$$$";
    let playFrom = [];
    if (p.重定向 && p.重定向.startsWith("js:")) {
      print("开始执行重定向代码:" + p.重定向);
      // 确保 jsp 对象可用，并正确绑定方法
      const jsoupInstance = new jsoup();
      globalThis.jsp = createSafeJsoup(jsoupInstance);
      html = eval(p.重定向.replace("js:", ""));
    }
    if (p.tabs) {
      if (p.tabs.startsWith("js:")) {
        print("开始执行tabs代码:" + p.tabs);
        var input = MY_URL;
        // 确保 jsp 对象可用，并正确绑定方法
        const jsoupInstance = new jsoup();
        globalThis.jsp = createSafeJsoup(jsoupInstance);
        eval(p.tabs.replace("js:", ""));
        playFrom = TABS;
      } else {
        let p_tab = p.tabs.split(";")[0];
        let vHeader = _pdfa(html, p_tab);
        console.log('vHeader.length',vHeader.length);
        let tab_text = p.tab_text || "body&&Text";
        let new_map = {};
        for (let v of vHeader) {
          let v_title = _pdfh(v, tab_text).trim();
          if (!v_title) {
            v_title = "线路空";
          }
          console.log(v_title);
          if (tab_exclude && new RegExp(tab_exclude).test(v_title)) {
            continue;
          }
          if (!new_map.hasOwnProperty(v_title)) {
            new_map[v_title] = 1;
          } else {
            new_map[v_title] += 1;
          }
          if (new_map[v_title] > 1) {
            v_title += Number(new_map[v_title] - 1);
          }
          playFrom.push(v_title);
        }
      }
      console.log(JSON.stringify(playFrom));
    } else {
      playFrom = ["道长在线"];
    }
    vod.vod_play_from = playFrom.join(vod_play_from);
    let vod_play_url = "$$$";
    let vod_tab_list = [];
    if (p.lists) {
      if (p.lists.startsWith("js:")) {
        print("开始执行lists代码:" + p.lists);
        try {
          var input = MY_URL;
          var play_url = "";
          // 确保 jsp 对象可用，并正确绑定方法
          const jsoupInstance = new jsoup();
          globalThis.jsp = createSafeJsoup(jsoupInstance);
          eval(p.lists.replace("js:", ""));
          for (let i in LISTS) {
            if (LISTS.hasOwnProperty(i)) {
              try {
                LISTS[i] = LISTS[i].map((it) =>
                  it.split("$").slice(0, 2).join("$")
                );
              } catch (e) {
                print(`格式化LISTS发生错误:${e.message}`);
              }
            }
          }
          vod_play_url = LISTS.map((it) => it.join("#")).join(vod_play_url);
        } catch (e) {
          print(`js执行lists: 发生错误:${e.message}`);
        }
      } else {
        let list_text = p.list_text || "body&&Text";
        let list_url = p.list_url || "a&&href";
        let list_url_prefix = p.list_url_prefix || "";
        let is_tab_js = p.tabs.trim().startsWith("js:");
        for (let i = 0; i < playFrom.length; i++) {
          let tab_name = playFrom[i];
          let tab_ext =
            p.tabs.split(";").length > 1 && !is_tab_js
              ? p.tabs.split(";")[1]
              : "";
          let p1 = p.lists.replaceAll("#idv", tab_name).replaceAll("#id", i);
          tab_ext = tab_ext.replaceAll("#idv", tab_name).replaceAll("#id", i);
          let tabName = tab_ext ? _pdfh(html, tab_ext) : tab_name;
          console.log(tabName);
          let new_vod_list = [];
          if (typeof pdfl === "function") {
            new_vod_list = pdfl(html, p1, list_text, list_url, MY_URL);
            if (list_url_prefix) {
              new_vod_list = new_vod_list.map(
                (it) =>
                  it.split("$")[0] +
                  "$" +
                  list_url_prefix +
                  it.split("$").slice(1).join("$")
              );
            }
          } else {
            let vodList = [];
            try {
              vodList = _pdfa(html, p1);
              console.log("len(vodList):" + vodList.length);
            } catch (e) {}
            for (let i = 0; i < vodList.length; i++) {
              let it = vodList[i];
              new_vod_list.push(
                _pdfh(it, list_text).trim() +
                  "$" +
                  list_url_prefix +
                  _pd(it, list_url, MY_URL)
              );
            }
          }
          if (new_vod_list.length > 0) {
            new_vod_list = forceOrder(new_vod_list, "", (x) => x.split("$")[0]);
          }
          let vlist = new_vod_list.join("#");
          vod_tab_list.push(vlist);
        }
        vod_play_url = vod_tab_list.join(vod_play_url);
      }
    }
    vod.vod_play_url = vod_play_url;
  }
  if (rule.图片替换 && rule.图片替换.includes("=>")) {
    let replace_from = rule.图片替换.split("=>")[0];
    let replace_to = rule.图片替换.split("=>")[1];
    vod.vod_pic = vod.vod_pic.replace(replace_from, replace_to);
  }
  if (rule.图片来源 && vod.vod_pic && vod.vod_pic.startsWith("http")) {
    vod.vod_pic = vod.vod_pic + rule.图片来源;
  }
  if (!vod.vod_id || (vod_id.includes("$") && vod.vod_id !== vod_id)) {
    vod.vod_id = vod_id;
  }
  try {
    vod = vodDeal(vod);
  } catch (e) {
    console.log(`vodDeal发生错误:${e.message}`);
  }

  return JSON.stringify({ list: [vod] });

}

/**
 * 搜索解析 (完整实现)
 */
function searchParse(searchObj, rule) {
    const timer = createTimer('搜索解析');
    initFetchParams();
    
    let d = [];
    if (!searchObj.searchUrl) {
        return JSON.stringify({ list: [] });
    }
    if (rule.searchNoPage && Number(searchObj.pg) > 1) {
        return JSON.stringify({ list: [] });
    }
    let p = searchObj.搜索 === '*' && searchObj.一级 ? searchObj.一级 : searchObj.搜索;
    if (!p || typeof p !== 'string') {
        return JSON.stringify({list: []});
    }
    p = p.trim();
    let url = searchObj.searchUrl.replaceAll('**', searchObj.wd);
    if (searchObj.pg === 1 && url.includes('[') && url.includes(']') && !url.includes('#')) {
        url = url.split('[')[1].split(']')[0];
    } else if (searchObj.pg > 1 && url.includes('[') && url.includes(']') && !url.includes('#')) {
        url = url.split('[')[0];
    }

    if (/fypage/.test(url)) {
        if (url.includes('(') && url.includes(')')) {
            let url_rep = url.match(/.*?\((.*)\)/)[1];
            let cnt_page = url_rep.replaceAll('fypage', searchObj.pg);
            let cnt_pg = eval(cnt_page);
            url = url.replaceAll(url_rep, cnt_pg).replaceAll('(', '').replaceAll(')', '');
        } else {
            url = url.replaceAll('fypage', searchObj.pg);
        }
    }
    
    // 确保MY_URL在全局和局部都可访问
    MY_URL = url;
    globalThis.rule=rule;
    try {
        if (p.startsWith('js:')) {
            // JavaScript搜索
            const TYPE = 'search';
            const MY_PAGE = searchObj.pg;
            const KEY = searchObj.wd;
            var input = MY_URL;
            var detailUrl = rule.detailUrl || '';
           // HOST = rule.host;
            
            try {
                // 重置VODS，确保干净的执行环境
                globalThis.VODS = [];
                // 确保 jsp 对象可用，并正确绑定方法
                const jsoupInstance = new jsoup();
                globalThis.jsp = createSafeJsoup(jsoupInstance);
                // 保存原始的setResult函数
                const originalSetResult = globalThis.setResult;
                // 创建一个包装函数来捕获setResult的返回值
                globalThis.setResult = function(data) {
                    const result = originalSetResult(data);
                    globalThis.VODS = result; // 将转换后的结果赋值给VODS
                    return result;
                };
                
                // 设置MY_FL为空对象，避免未定义错误
                globalThis.MY_FL = {};
                // 设置MY_CATE为空字符串，避免未定义错误
                globalThis.MY_CATE = '';
                
                eval(p.trim().replace('js:', ''));
                
                // 恢复原始的setResult函数
                globalThis.setResult = originalSetResult;
                
                // 优先使用VODS，如果VODS为空则使用setResult的返回值
                d = globalThis.VODS && globalThis.VODS.length > 0 ? globalThis.VODS : d;
            } catch (e) {
                log(`js搜索执行错误:${e.message}`);
                return JSON.stringify({list: []});
            }
        } else {
            // 普通搜索解析
            p = p.split(';');
            if (p.length < 5) {
                return JSON.stringify({list: []});
            }
            
            let _ps = parseTags.getParse(p[0]);
            let _pdfa = _ps.pdfa;
            let _pdfh = _ps.pdfh;
            let _pd = _ps.pd;
            let is_json = p[0].startsWith('json:');
            p[0] = p[0].replace(/^(jsp:|json:|jq:)/, '');
            
            try {
                let html = makeRequest(url);
                if (is_json) {
                    html = dealJson(html);
                }
                
                // 搜索结果验证
                if (!html.includes(searchObj.wd)) {
                    console.log("搜索结果源码未包含关键字,疑似搜索失败");
                }
                
                let list = _pdfa(html, p[0]);
                list.forEach((it) => {
                    try {
                        let links = p[4] ? p[4].split("+").map((p4) => {
                            return !rule.detailUrl ? _pd(it, p4, MY_URL) : _pdfh(it, p4);
                        }) : [_pd(it, 'a&&href', MY_URL)];
                        
                        let link = links.join("$");
                        let vod_id = rule.detailUrl ? link : link;
                        let vod_name = _pdfh(it, p[1]).replace(/\n|\t/g, "").trim();
                        let vod_pic = _pd(it, p[2], MY_URL);
                        let vod_remarks = _pdfh(it, p[3]).replace(/\n|\t/g, "").trim();
                        
                        if (vod_name) {
                            d.push({
                                vod_id: vod_id,
                                vod_name: vod_name,
                                vod_pic: vod_pic,
                                vod_remarks: vod_remarks
                            });
                        }
                    } catch (e) {
                        log(`搜索列表解析单个元素出错:${e.message}`);
                    }
                });
            } catch (e) {
                log(`搜索请求失败:${e.message}`);
                return JSON.stringify({list: []});
            }
        }
        
        // 使用通用图片处理函数
        d = processImages(d, rule);
        
        timer();
        
        return JSON.stringify({
            list: d,
            limit: 20,
            total: 999,
            page: parseInt(searchObj.pg),
            pagecount: 999
        });
        
    } catch (e) {
        log(`搜索解析异常:${e.message}`);
        return JSON.stringify({list: []});
    }
}

/**
 * 播放解析 (完整实现)
 */
function playParse(playObj, rule) {
    const timer = createTimer('播放解析');
    fetch_params = JSON.parse(JSON.stringify(rule_fetch_params));
    let input = playObj.play_url;
    let playFlag = playObj.flag;
    
    let common_play = {
        parse: CONSTANTS.SPECIAL_URL.test(input) || /^(push:)/.test(input) ? 0 : 1,
        jx: globalThis.tellIsJx(input),
        url: input,
    };
    let lazy_play;
    
    if (!rule.play_parse || !rule.lazy) {
        lazy_play = common_play;
    } else if (rule.play_parse && rule.lazy && rule.lazy.trim()) {
        try {
            let lazy_code = rule.lazy.trim();
            if (lazy_code.startsWith('js:')) {
                lazy_code = lazy_code.replace('js:', '');
            }
            
            // 设置播放解析上下文
            var MY_URL = input;
            var flag = playFlag;
            HOST = rule.host;
            // 设置MY_FL为空对象，避免未定义错误
            globalThis.MY_FL = {};
            // 设置MY_CATE为空字符串，避免未定义错误
            globalThis.MY_CATE = '';
            
            console.log("开始执行js免嗅=>" + lazy_code);
            eval(lazy_code);
            
            // 处理不同类型的返回值
            if (typeof input === 'object') {
                lazy_play = input;
            } else if (typeof input === 'string') {
                lazy_play = {
                    parse: CONSTANTS.SPECIAL_URL.test(input) || /^(push:)/.test(input) ? 0 : 1,
                    jx: globalThis.tellIsJx(input),
                    url: input,
                };
            } else {
                lazy_play = common_play;
            }
        } catch (e) {
            log(`js免嗅错误:${e.message}`);
            lazy_play = common_play;
        }
    } else {
        lazy_play = common_play;
    }

    // 播放json处理
    if (Array.isArray(rule.play_json) && rule.play_json.length > 0) {
        let web_url = lazy_play.url;
        for (let pjson of rule.play_json) {
            if (pjson.re && (pjson.re === '*' || web_url.match(new RegExp(pjson.re)))) {
                if (pjson.json && typeof pjson.json === 'object') {
                    let base_json = pjson.json;
                    lazy_play = Object.assign(lazy_play, base_json);
                    break;
                }
            }
        }
    } else if (rule.play_json && typeof rule.play_json === 'number') {
        // 兼容旧版本数字形式
        lazy_play.jx = rule.play_json;
        if (rule.play_json === 0) {
            lazy_play.parse = 0;
        }
    }

    timer();
    
    return lazy_play;
}

// === API接口模块 ===

// 结构与drpyS.js一致，统一导出所有接口
export async function home(filePath, env, filter, home_html, class_parse) {
    const {rule} = await init(filePath, env);
    let homeObj = {
        filter: rule.filter || false,
        MY_URL: rule.homeUrl,
        class_name: rule.class_name || "",
        class_url: rule.class_url || "",
        class_parse: rule.class_parse || class_parse|| "",
        cate_exclude: rule.cate_exclude,
        home_html: home_html,
    };
    let result = await homeParse(homeObj);
    return parseJsonResult(result);
}

export async function homeVod(filePath, env, params) {
    const {rule} = await init(filePath, env);
    let homeVodObj = {
        推荐: rule.推荐,
        double: rule.double,
        homeUrl: rule.homeUrl,
        detailUrl: rule.detailUrl,
        host: rule.host,
        一级: rule.一级,
        home_html: params?.home_html
    };
    let result = await homeVodParse(homeVodObj, rule);
    return parseJsonResult(result);
}

export async function category(filePath, env, tid, pg, filter, extend) {
    const {rule} = await init(filePath, env);
    let cateObj = {
        tid: tid,
        pg: pg || 1,
        filter: filter,
        extend: extend || {},
        url: rule.url,
        一级: rule.一级,
    };
    let result = await categoryParse(cateObj, rule);
    return parseJsonResult(result);
}

export async function cate(filePath, env, tid, pg, filter, extend) {
    return category(filePath, env, tid, pg, filter, extend);
}

export async function detail(filePath, env, vod_url) {
    const { rule } = await init(filePath, env);
    vod_url=Array.isArray(vod_url) ? vod_url[0] : vod_url;
    const [fyclass = '', actualUrl = ''] = vod_url.includes('$') 
        ? vod_url.split('$') 
        : ['', vod_url];
    const detailUrl = actualUrl.split('@@')[0];
    let url;
    if (!detailUrl.startsWith("http")) {
        url = detailUrl.includes("/") 
            ? urljoin(rule.homeUrl, detailUrl)
            : rule.detailUrl.replaceAll("fyid", detailUrl).replaceAll("fyclass", fyclass);
    } else {
        url = detailUrl;
    }
    const detailObj = {
        orId: vod_url,
        url,
        二级: rule.二级,
        二级访问前: rule.二级访问前,
        detailUrl,
        fyclass,
        tab_exclude: rule.tab_exclude
    };
    const result = await detailParse(detailObj, rule);
    return parseJsonResult(result);
}

export async function search(filePath, env, wd, quick, pg) {
    const {rule} = await init(filePath, env);
    wd = processEncoding(wd, rule);
    let searchObj = {
        searchUrl: rule.searchUrl,
        搜索: rule.搜索,
        wd: wd,
        pg: pg || 1,
        quick: quick,
        一级: rule.一级,
        host: rule.host
    };
    let result = await searchParse(searchObj, rule);
    return parseJsonResult(result);
}

export async function play(filePath, env, flag, id, flags) {
    const {rule} = await init(filePath, env);
    let playObj = {
        play_url: id,
        flag: flag,
        flags: flags
    };
    log(`playParse: flag=${flag}, id=${id}, flags=${flags}`,playObj);
    return playParse(playObj, rule);
}

export async function proxy(filePath, env, params) {
    const {rule} = await init(filePath, env);
    try {
        if (rule.proxy_rule && rule.proxy_rule.trim()) {
            let proxy_code = rule.proxy_rule.trim();
            if (proxy_code.startsWith('js:')) {
                proxy_code = proxy_code.replace('js:', '');
            }
            var input = params;
            eval(proxy_code);
            return (Array.isArray(input)&&input.length>=3) ? input : [200, 'text/plain', input];
        }
        return [404, 'text/plain', 'Not Found'];
    } catch (e) {
        log(`代理执行错误:${e.message}`);
        return [500, 'text/plain', 'Internal Server Error'];
    }
}

export async function getRuleObject(filePath, env) {
    const {rule} = await init(filePath, env);
    return rule;
}

/**
 * 初始化模块：加载并执行模块文件，存储初始化后的 rule 对象
 * 支持模板继承、参数合并、预处理、hostJs、全局变量设置等
 * @param {string} filePath - 模块文件路径
 * @param env - 环境变量
 * @param refresh - 是否强制刷新缓存
 * @returns {Promise<object>} - 返回 { rule, sandbox, context }
 */
export async function init(filePath, env = {}, refresh = false) {
    // 读取文件内容
    const fileContent = await readFile(filePath, 'utf-8');
    // 计算文件的 hash 值
    const fileHash = computeHash(fileContent);

    // 缓存处理
    if (moduleCache.has(filePath) && !refresh) {
        const cached = moduleCache.get(filePath);
        if (cached.hash === fileHash) {
            return cached.moduleObject;
        }
    }
    
    // 创建沙箱和上下文
    const {sandbox, context} = await getSandbox(env);
       // 解析源码，兼容压缩/混淆
    let js_code = fileContent;
    if (typeof getOriginalJs === 'function') {
        try { js_code = getOriginalJs(fileContent); } catch (e) {}
    }
    // 包裹为异步函数，便于支持异步预处理
    const js_code_wrapper = `
    _asyncGetRule = (async function() {
        ${js_code}
        if (typeof Rule === 'function') rule = new Rule();
        return rule;
    })();
    `;
    // 执行 rule 脚本
    const ruleScript = new vm.Script(js_code_wrapper);
    await ruleScript.runInContext(context);
    
    // 获取 rule 对象
    let rule = await context._asyncGetRule;
    
    // 处理基础 host
    rule.host = (rule.host || '').replace(/\/$/, '');
    HOST = rule.host;
   
    // hostJs 动态获取 host
    if (typeof rule.hostJs === 'function') {
        try {
            let newHost = await rule.hostJs.apply({input: rule.host, MY_URL: rule.host, HOST: rule.host});
            if (newHost) {
                rule.host = (newHost || '').replace(/\/$/, '');
                HOST = rule.host;
            }
        } catch (e) { 
            log(`hostJs执行错误:${e.message}`); 
        }
    }
    
    // 处理"模板=自动"的情况
    if (rule && rule["模板"] === "自动") {
        try {
            let host_headers = rule["headers"] || {};
            let host_html = await globalThis.getHtml(rule.host, {headers: host_headers});
            let match_muban = "";
            let muban_keys = Object.keys(sandbox.muban).filter(
                (it) => !/默认|短视2|采集1/.test(it)
            );
            
            for (let muban_key of muban_keys) {
                try {
                    let host_data = JSON.parse(
                        await homeParse({
                            filter: false,
                            MY_URL: rule.host,
                            class_name: "",
                            class_url: "",
                            class_parse: sandbox.muban[muban_key].class_parse || "",
                            cate_exclude: "",
                            home_html: host_html
                        })
                    );
                    if (host_data.class && host_data.class.length > 0) {
                        match_muban = muban_key;
                        console.log(`自动匹配模板:【${muban_key}】`);
                        break;
                    }
                } catch (e) {
                    console.log(`自动匹配模板:【${muban_key}】错误:${e.message}`);
                }
            }
            
            if (match_muban) {
                sandbox.muban["自动"] = sandbox.muban[match_muban];
                if (rule["模板修改"] && rule["模板修改"].startsWith("js:")) {
                    try {
                        // 确保 jsp 对象可用，并正确绑定方法
                        const jsoupInstance = new jsoup();
                        globalThis.jsp = createSafeJsoup(jsoupInstance);
                        eval(rule["模板修改"].replace("js:", "").trim());
                    } catch (e) {
                        console.log(`模板修改执行错误:${e.message}`);
                    }
                }
            } else {
                delete rule["模板"];
            }
        } catch (e) {
            console.log(`自动匹配模板发生错误:${e.message}`);
            delete rule["模板"];
        }
    }
    
    // 模板继承
    if (rule && rule.模板 && sandbox.muban && sandbox.muban[rule.模板]) {
        rule = Object.assign({}, sandbox.muban[rule.模板], rule);
    }
    // filter解压缩处理
    if (typeof rule.filter === "string" && rule.filter.trim().length > 0) {
        try {
            let filter_json = globalThis.ungzip(rule.filter.trim());
            rule.filter = JSON.parse(filter_json);
        } catch (e) {
            rule.filter = {};
        }
    }
    // 模板再次继承（兼容部分规则）
    if (rule && rule.模板 && sandbox.muban && sandbox.muban[rule.模板]) {
        rule = Object.assign({}, sandbox.muban[rule.模板], rule);
    }
    // 合并全局排除
    let rule_cate_excludes = (rule.cate_exclude || '').split('|').filter(it => it.trim());
    let rule_tab_excludes = (rule.tab_exclude || '').split('|').filter(it => it.trim());
    rule_cate_excludes = rule_cate_excludes.concat((CONSTANTS.CATE_EXCLUDE || '').split('|').filter(it => it.trim()));
    rule_tab_excludes = rule_tab_excludes.concat((CONSTANTS.TAB_EXCLUDE || '').split('|').filter(it => it.trim()));
    rule.cate_exclude = rule_cate_excludes.join('|');
    rule.tab_exclude = rule_tab_excludes.join('|');
    // 兼容常用字段
    rule.类型 = rule.类型 || '影视';
    rule.url = rule.url || '';
    rule.double = rule.double || false;
    rule.homeUrl = rule.homeUrl || '';
    rule.detailUrl = rule.detailUrl || '';
    rule.searchUrl = rule.searchUrl || '';
    rule.homeUrl = rule.host && rule.homeUrl ? urljoin(rule.host, rule.homeUrl) : (rule.homeUrl || rule.host);
    rule.homeUrl = jinja.render(rule.homeUrl, {rule: rule});
    rule.detailUrl = rule.host && rule.detailUrl ? urljoin(rule.host, rule.detailUrl) : rule.detailUrl;
    // 其它常用字段
    rule.二级访问前 = rule.二级访问前 || '';
    rule.timeout = rule.timeout || 5000;
    rule.encoding = rule.编码 || rule.encoding || 'utf-8';
    rule.search_encoding = rule.搜索编码 || rule.search_encoding || '';
    rule.图片来源 = rule.图片来源 || '';
    rule.图片替换 = rule.图片替换 || '';
    rule.play_json = rule.hasOwnProperty('play_json') ? rule.play_json : [];
    rule.pagecount = rule.hasOwnProperty('pagecount') ? rule.pagecount : {};
    rule.proxy_rule = rule.hasOwnProperty('proxy_rule') ? rule.proxy_rule : '';
    if (!rule.hasOwnProperty('sniffer')) rule.sniffer = false;
    rule.sniffer = !!(rule.sniffer && rule.sniffer !== '0' && rule.sniffer !== 'false');
    rule.isVideo = rule.hasOwnProperty('isVideo') ? rule.isVideo : '';
    if (rule.sniffer && !rule.isVideo) {
        rule.isVideo = 'http((?!http).){12,}?\\.(m3u8|mp4|flv|avi|mkv|rm|wmv|mpg|m4a|mp3)\\?.*|http((?!http).){12,}\\.(m3u8|mp4|flv|avi|mkv|rm|wmv|mpg|m4a|mp3)|http((?!http).)*?video/tos*|http((?!http).)*?obj/tos*';
    }
    rule.tab_remove = rule.hasOwnProperty('tab_remove') ? rule.tab_remove : [];
    rule.tab_order = rule.hasOwnProperty('tab_order') ? rule.tab_order : [];
    rule.tab_rename = rule.hasOwnProperty('tab_rename') ? rule.tab_rename : {};
    // headers 处理
    if (rule.headers && typeof rule.headers === 'object') {
        try {
            let header_keys = Object.keys(rule.headers);
            for (let k of header_keys) {
                if (k.toLowerCase() === 'user-agent') {
                    let v = rule.headers[k];
                    if (["MOBILE_UA", "PC_UA", "UC_UA", "IOS_UA", "UA"].includes(v)) {
                        rule.headers[k] = sandbox[v];
                    }
                } else if (k.toLowerCase() === 'cookie') {
                    let v = rule.headers[k];
                    if (v && v.startsWith('http')) {
                        try {
                            v = fetch(v);
                            rule.headers[k] = v;
                        } catch (e) {}
                    }
                }
            }
        } catch (e) {}
    } else {
        rule.headers = {};
    }
    // 全局变量注入
    sandbox.rule = rule;
    sandbox.HOST = rule.host || '';
    sandbox.MY_URL = rule.homeUrl || '';
    sandbox.RKEY = rule.key || '';
    sandbox.rule_fetch_params = {headers: rule.headers, timeout: rule.timeout, encoding: rule.encoding};
    sandbox.fetch_params = sandbox.rule_fetch_params;
    // 预处理
    if (typeof rule.预处理 === 'function') {
        try { await rule.预处理(env); } catch (e) { log('预处理执行失败:' + e.message); }
    } else if (typeof rule.预处理 === 'string' && rule.预处理.startsWith('js:')) {
        try { 
            // 确保 jsp 对象可用
            const jsoupInstance = new jsoup();
            globalThis.jsp = jsoupInstance;
            eval(rule.预处理.replace('js:', '')); 
        } catch (e) { log('预处理js执行失败:' + e.message); }
    }
    
    // 使用通用URL处理函数
    rule.homeUrl = rule.homeUrl ? processRuleUrl(rule.homeUrl, rule.host) : rule.host;
    rule.detailUrl = processRuleUrl(rule.detailUrl, rule.host);
    rule.url = processRuleUrl(rule.url, rule.host, true);
    rule.searchUrl = processRuleUrl(rule.searchUrl, rule.host, !rule.searchUrl.includes('#'));
    // 缓存
    const moduleObject = {rule, sandbox, context, hash: fileHash};
    moduleCache.set(filePath, {moduleObject, hash: fileHash});
    // 彻底全局化rule，兼容所有js:代码和session机制
    globalThis.rule = rule;
    return { rule, sandbox, context};
}

// 兼容drpyS.js的默认导出对象
const drpy2 = {
    home,
    homeVod,
    category,
    cate,
    detail,
    search,
    play,
    proxy,
    getRuleObject,
    getSandbox,
    // 内部调试导出

    homeParse,
    homeVodParse,
    categoryParse,
    detailParse,
    searchParse,
    playParse,
    init
};

export default drpy2;
