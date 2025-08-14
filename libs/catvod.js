import path from "path";
import {readFile} from "fs/promises";
import {getSitesMap} from "../utils/sites-map.js";
import {computeHash, deepCopy, getNowTime} from "../utils/utils.js";
import {fileURLToPath, pathToFileURL} from 'url';
import {md5} from "../libs_drpy/crypto-util.js";

// 缓存已初始化的模块和文件 hash 值
const moduleCache = new Map();
const ruleObjectCache = new Map();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _data_path = path.join(__dirname, '../data');
const _config_path = path.join(__dirname, '../config');
const _lib_path = path.join(__dirname, '../spider/catvod');
const enable_cat_debug = Number(process.env.CAT_DEBUG) || 0;


const json2Object = function (json) {
    if (!json) {
        return {}
    } else if (json && typeof json === 'object') {
        return json
    }
    return JSON.parse(json);
}

const loadEsmWithHash = async function (filePath, fileHash) {
    const scriptUrl = `${pathToFileURL(filePath).href}?v=${fileHash}`;
    return await import(scriptUrl);
}

const loadEsmWithEnv = async function (filePath, env) {
    const rawCode = await readFile(filePath, 'utf8');
    let injectedCode = rawCode;
    const esm_flag1 = 'export function __jsEvalReturn';
    const esm_flag2 = 'export default';
    const polyfill_code = 'var ENV={};\nvar getProxyUrl=null;\nexport const initEnv = (env)=>{ENV = env;if(env.getProxyUrl){getProxyUrl=env.getProxyUrl}};\n';
    if (rawCode.includes(esm_flag1)) {
        injectedCode = rawCode.replace(esm_flag1, `${polyfill_code}${esm_flag1}`)
    } else if (rawCode.includes('export default')) {
        injectedCode = rawCode.replace(esm_flag2, `${polyfill_code}${esm_flag2}`)
    }
    // console.log(injectedCode);
    // // 创建数据URI模块
    const dataUri = `data:text/javascript;base64,${Buffer.from(injectedCode).toString('base64')}`;
    const module = await import(dataUri);
    const initEnv = module.initEnv;
    if (typeof initEnv === 'function' && env) {
        initEnv(env);
    }
    return module
}

const getRule = async function (filePath, env) {
    const moduleObject = await init(filePath, env);
    return JSON.stringify(moduleObject);
}

const init = async function (filePath, env = {}, refresh) {
    try {
        const fileContent = await readFile(filePath, 'utf-8');
        const fileHash = computeHash(fileContent);
        const moduleName = path.basename(filePath, '.js');
        let moduleExt = env.ext || '';
        let SitesMap = getSitesMap(_config_path);
        if (moduleExt && SitesMap[moduleName]) {
            try {
                moduleExt = ungzip(moduleExt);
            } catch (e) {
                log(`[${moduleName}] ungzip解密moduleExt失败: ${e.message}`);
            }
            if (!SitesMap[moduleName].find(i => i.queryStr === moduleExt) && !SitesMap[moduleName].find(i => i.queryObject.params === moduleExt)) {
                throw new Error("moduleExt is wrong!")
            }
        }
        let hashMd5 = md5(filePath + '#pAq#' + moduleExt);
        if (moduleCache.has(hashMd5) && !refresh) {
            const cached = moduleCache.get(hashMd5);
            // 除hash外还必须保证proxyUrl实时相等，避免本地代理url的尴尬情况
            if (cached.hash === fileHash && cached.proxyUrl === env.proxyUrl) {
                return cached.moduleObject;
            }
        }
        log(`Loading module: ${filePath}`);
        let t1 = getNowTime();
        let module;
        if (enable_cat_debug) {
            module = await loadEsmWithHash(filePath, fileHash);
        } else {
            module = await loadEsmWithEnv(filePath, env);
        }
        // console.log('module:', module);
        let rule;
        if (module && module.__jsEvalReturn && typeof module.__jsEvalReturn === 'function') {
            rule = module.__jsEvalReturn();
        } else {
            rule = module.default || module;
        }
        // console.log('rule:', rule);
        // console.log('globalThis.ENV:', globalThis.ENV);
        // console.log('globalThis.getProxyUrl:', globalThis.getProxyUrl);
        // 加载 init
        await rule.init(moduleExt || {});
        let t2 = getNowTime();
        const moduleObject = deepCopy(rule);
        moduleObject.cost = t2 - t1;
        moduleCache.set(hashMd5, {moduleObject, hash: fileHash, proxyUrl: env.proxyUrl});
        return moduleObject;
    } catch (error) {
        console.log(`Error in catvod.init :${filePath}`, error);
        throw new Error(`Failed to initialize module:${error.message}`);
    }
}

const home = async function (filePath, env, filter = 1) {
    const moduleObject = await init(filePath, env);
    return json2Object(await moduleObject.home(filter));
}

const homeVod = async function (filePath, env) {
    const moduleObject = await init(filePath, env);
    return json2Object(await moduleObject.homeVod());
}


const cate = async function (filePath, env, tid, pg = 1, filter = 1, extend = {}) {
    const moduleObject = await init(filePath, env);
    return json2Object(await moduleObject.category(tid, pg, filter, extend));
}

const detail = async function (filePath, env, ids) {
    const moduleObject = await init(filePath, env);
    return json2Object(await moduleObject.detail(ids));
}


const search = async function (filePath, env, wd, quick = 0, pg = 1) {
    const moduleObject = await init(filePath, env);
    return json2Object(await moduleObject.search(wd, quick, pg));
}

const play = async function (filePath, env, flag, id, flags) {
    const moduleObject = await init(filePath, env);
    return json2Object(await moduleObject.play(flag, id, flags));
}


const proxy = async function (filePath, env, params) {
    const moduleObject = await init(filePath, env);
    return json2Object(await moduleObject.proxy(params));
}

const action = async function (filePath, env, action, value) {
    const moduleObject = await init(filePath, env);
    return json2Object(await moduleObject.action(action, value));
}

export default {
    getRule,
    init,
    home,
    homeVod,
    cate,
    detail,
    search,
    play,
    proxy,
    action,
}