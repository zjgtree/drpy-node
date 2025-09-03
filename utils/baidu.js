import req from './req.js';
import {ENV} from './env.js';
import COOKIE from './cookieManager.js';
import '../libs_drpy/crypto-js.js';
import {join} from 'path';
import fs from 'fs';
import {PassThrough} from 'stream';

class BaiduHandler {
    constructor() {
        // 初始化百度云盘处理类
        this._cookie = ENV.get('baidu_cookie') || '';
        this.regex = /https:\/\/pan\.baidu\.com\/s\/([^\\|#/]+)/;
        this.baseHeader = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept-Encoding': 'gzip',
            'Referer': 'https://pan.baidu.com',
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        this.apiUrl = 'https://pan.baidu.com/';
        this.shareTokenCache = {};
        this.saveDirName = 'drpy';
        this.saveDirId = null;
        this.subtitleExts = ['.srt', '.ass', '.scc', '.stl', '.ttml'];
        this.subvideoExts = ['.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.webm', '.3gp', '.mpeg', '.mpg'];

        // 2小时自动清理
        this.cleanupInterval = setInterval(() => {
            this.clearSaveDir();
        }, 2 * 60 * 60 * 1000);
    }

    // 获取完整的 cookie
    get cookie() {
        return (this._cookie || '').trim();
    }

    set cookie(newCookie) {
        console.log('更新cookie');
        this._cookie = newCookie;
    }

    getShareData(url) {
        this.clearSaveDir();
        // 解析分享链接获取分享ID和密码
        try {
            url = decodeURIComponent(url).replace(/\s+/g, '');
            let shareId = '';
            let sharePwd = '';
            const match = url.match(/pan\.baidu\.com\/(s\/|wap\/init\?surl=)([^?&#]+)/);
            if (!match) {
                return null;
            }
            shareId = match[2].replace(/^1+/, '').split('?')[0].split('#')[0];
            if (!shareId) {
                return null;
            }
            const pwdMatch = url.match(/(提取码|密码|pwd)=([^&\s]{4})/i);
            sharePwd = pwdMatch ? pwdMatch[2] : '';
            return {shareId, sharePwd};
        } catch (error) {
            return null;
        }
    }

    async initBaidu(db, cfg) {
        // 初始化百度云盘
        if (this.cookie) {
            await this.createSaveDir();
        }
    }

    async createSaveDir() {
        // 创建保存目录
        if (!this.cookie) {
            return null;
        }
        try {
            const listResp = await this.api('api/list', {
                dir: '/',
                order: 'name',
                desc: 0,
                showempty: 0,
                web: 1,
                app_id: 250528
            }, {Cookie: this.cookie}, 'get');

            if (listResp.errno !== 0) {
                return null;
            }

            const drpyDir = listResp.list.find(item =>
                item.isdir === 1 && item.server_filename === this.saveDirName
            );

            if (drpyDir) {
                this.saveDirId = drpyDir.fs_id;
                return this.saveDirId;
            }

            const createResp = await this.api('api/create', {
                path: `/${this.saveDirName}`,
                isdir: 1,
                block_list: '[]',
                web: 1,
                app_id: 250528
            }, {Cookie: this.cookie}, 'post');

            if (createResp.errno !== 0) {
                return null;
            }

            this.saveDirId = createResp.fs_id;
            return this.saveDirId;
        } catch (error) {
            return null;
        }
    }

    async api(url, data = {}, headers = {}, method = 'post', retry = 3) {
        // 发送API请求
        const objectToQuery = (obj) => {
            return Object.entries(obj)
                .filter(([_, value]) => value !== undefined && value !== null)
                .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
                .join('&');
        };

        const fullUrl = `${this.apiUrl}${url}`;
        headers = {...this.baseHeader, ...headers, Cookie: this.cookie || ''};
        let resp;

        try {
            if (method === 'get') {
                const query = objectToQuery(data);
                const finalUrl = query ? `${fullUrl}?${query}` : fullUrl;
                resp = await req.get(finalUrl, {headers});
            } else {
                resp = await req.post(fullUrl, data, {headers});
            }
        } catch (err) {
            resp = err.response || {status: 500, data: {error: '请求失败'}};
        }

        if ([429, 503].includes(resp.status) && retry > 0) {
            const waitTime = (3 - retry + 1) * 1000;
            await this.delay(waitTime);
            return this.api(url, data, headers, method, retry - 1);
        }

        return resp.data !== undefined ? resp.data : resp;
    }

    // 新增验证分享链接的函数
    async verifyShare(shareData) {
        try {
            const shareVerify = await this.api(`share/verify?t=${Date.now()}&surl=${shareData.shareId}`, {
                pwd: shareData.sharePwd || '',
            }, {Cookie: this.cookie}, 'post');

            if (shareVerify.errno !== 0) {
                if (shareVerify.errno === -62 || shareVerify.errno === -9) {
                    console.log('提取码错误');
                }
                console.log('验证提取码失败');
            }

            // 更新cookie中的BDCLND
            if (shareVerify.randsk) {
                let cookie = this.cookie.replace(/BDCLND=[^;]*;?\s*/g, '');
                if (cookie.length > 0 && !cookie.endsWith(';')) cookie += '; ';
                cookie += `BDCLND=${shareVerify.randsk}`;
                this.cookie = cookie;
                console.log('已更新randsk到cookie中的BDCLND');
            }

            return shareVerify;
        } catch (error) {
            console.log('验证分享链接失败:', error.message);
            throw error;
        }
    }

    async getShareToken(shareData) {
        // 先检查缓存，存在则直接返回
        if (this.shareTokenCache[shareData.shareId]) {
            return this.shareTokenCache[shareData.shareId];
        }

        // 缓存不存在时，执行获取令牌的逻辑
        try {
            // 等待验证完成
            const shareVerify = await this.verifyShare(shareData);

            // 验证完成后，执行获取文件列表的逻辑
            const headers = {...this.baseHeader, Cookie: this.cookie || ''};

            const listData = await this.api(`share/list`, {
                shorturl: shareData.shareId,
                root: 1,
                page: 1,
                num: 100
            }, {headers}, 'get');

            if (listData.errno !== 0) {
                if (listData.errno === -9) {
                    console.log('提取码错误');
                }
                console.log('获取文件列表失败');
            }

            // 设置缓存
            this.shareTokenCache[shareData.shareId] = {
                ...shareVerify,
                list: listData.list,
                uk: listData.uk || listData.share_uk,
                shareid: listData.share_id || shareVerify.share_id,
                randsk: shareVerify.randsk,
                sign: listData.sign || this.generateSign(shareData.shareId, shareData.sharePwd),
                timestamp: listData.timestamp || Date.now()
            };

            return this.shareTokenCache[shareData.shareId];
        } catch (error) {
            console.log('获取分享token失败:', error.message);
            throw error;
        }
    }


    generateSign(shareId, sharePwd) {
        // 生成签名
        const timestamp = Date.now();
        const str = `${shareId}${sharePwd}${timestamp}${this.cookie || ''}`;
        return CryptoJS.MD5(str).toString();
    }

    async getFilesByShareUrl(shareInfo) {
        // 获取分享链接中的文件列表
        const shareData = typeof shareInfo === 'string' ? this.getShareData(shareInfo) : shareInfo;
        if (!shareData) return {videos: []};

        // 确保验证和获取令牌完成后再继续
        await this.getShareToken(shareData);
        if (!this.shareTokenCache[shareData.shareId]) return {videos: []};

        const cachedData = this.shareTokenCache[shareData.shareId];
        const videos = [];
        const subtitles = [];

        const processDirectory = async (dirPath, dirFsId, parentDrpyPath = '') => {
            const shareDir = `/sharelink${cachedData.shareid}-${dirFsId}${dirPath}`;
            const headers = {...this.baseHeader, Cookie: this.cookie || ''};

            const dirListData = await this.api(`share/list`, {
                sekey: cachedData.randsk,
                uk: cachedData.uk,
                shareid: cachedData.shareid,
                page: 1,
                num: 100,
                dir: shareDir
            }, headers, 'get');

            if (dirListData.errno !== 0 || !dirListData.list) {
                return;
            }

            for (const item of dirListData.list) {
                if (item.isdir === 1 || item.isdir === '1') {
                    const subDirPath = `${dirPath}/${item.server_filename}`;
                    const subDrpyPath = `${parentDrpyPath}/${item.server_filename}`;
                    await processDirectory(subDirPath, item.fs_id, subDrpyPath);
                } else {
                    const ext = item.server_filename.substring(item.server_filename.lastIndexOf('.') || 0).toLowerCase();
                    const fileInfo = {
                        fid: item.fs_id,
                        file_name: item.server_filename,
                        size: item.size,
                        path: parentDrpyPath,
                        full_path: `/${this.saveDirName}${parentDrpyPath}/${item.server_filename}`,
                        file: true
                    };

                    if (this.subvideoExts.includes(ext)) {
                        videos.push(fileInfo);
                    } else if (this.subtitleExts.includes(ext)) {
                        subtitles.push(fileInfo);
                    }
                }
            }
        };

        if (cachedData.list) {
            for (const item of cachedData.list) {
                if (item.isdir === 1 || item.isdir === '1') {
                    const dirPath = `/${item.server_filename}`;
                    const drpyPath = `/${item.server_filename}`;
                    await processDirectory(dirPath, item.fs_id, drpyPath);
                } else {
                    const ext = item.server_filename.substring(item.server_filename.lastIndexOf('.') || 0).toLowerCase();
                    const fileInfo = {
                        fid: item.fs_id,
                        file_name: item.server_filename,
                        size: item.size,
                        path: '',
                        full_path: `/${this.saveDirName}/${item.server_filename}`,
                        file: true
                    };

                    if (this.subvideoExts.includes(ext)) {
                        videos.push(fileInfo);
                    } else if (this.subtitleExts.includes(ext)) {
                        subtitles.push(fileInfo);
                    }
                }
            }
        }

        const getBaseName = (fileName) => {
            const lastDotIndex = fileName.lastIndexOf('.');
            return lastDotIndex === -1 ? fileName : fileName.slice(0, lastDotIndex);
        };

        const subtitleMap = new Map();
        subtitles.forEach(sub => {
            const baseName = getBaseName(sub.file_name);
            if (!subtitleMap.has(baseName)) {
                subtitleMap.set(baseName, []);
            }
            subtitleMap.get(baseName).push(sub);
        });

        const videosWithSubtitles = videos.map(video => ({
            ...video,
            subtitles: subtitleMap.get(getBaseName(video.file_name)) || []
        }));

        return {videos: videosWithSubtitles};
    }

    async getDownload(shareId, fileId, filename) {
        // 获取文件下载链接
        if (!this.shareTokenCache[shareId]) {
            return null;
        }

        if (!fileId || !filename) {
            return null;
        }

        if (!this.cookie) {
            return null;
        }

        const shareData = {shareId, sharePwd: this.shareTokenCache[shareId].sharePwd || ''};
        const isSaved = await this.save(shareData, fileId);
        if (!isSaved) {
            return null;
        }

        const headers = {...this.baseHeader, Cookie: this.cookie || ''};
        let retryCount = 1;
        const fullPath = `/${this.saveDirName}/${filename}`;

        while (retryCount >= 0) {
            try {
                const mediaInfo = await this.api(`api/mediainfo`, {
                    type: 'M3U8_FLV_264_480', path: fullPath, clienttype: 80, origin: 'dlna'
                }, headers, 'get');
                if (mediaInfo.errno === 133 && mediaInfo.info?.dlink) {
                    return {
                        dlink: mediaInfo.info.dlink,
                        headers,
                        full_path: fullPath
                    };
                }

                const downloadInfo = await this.api(`api/download`, {
                    type: 'download', path: fullPath, app_id: 250528
                }, headers, 'get');

                if (downloadInfo.errno === 0 && downloadInfo.dlink) {
                    return {
                        dlink: downloadInfo.dlink,
                        headers,
                        is_direct: true,
                        full_path: fullPath
                    };
                }

                retryCount--;
                if (retryCount >= 0) {
                    await this.delay(1000);
                }
            } catch (error) {
                retryCount--;
                if (retryCount >= 0) await this.delay(1000);
            }
        }

        return null;
    }

    async save(shareData, fileFsId) {
        // 保存文件到指定目录
        if (!this.cookie) {
            return false;
        }

        if (!this.saveDirId) {
            this.saveDirId = await this.createSaveDir();
            if (!this.saveDirId) {
                return false;
            }
        }

        if (!this.shareTokenCache[shareData.shareId]) {
            await this.getShareToken(shareData);
            if (!this.shareTokenCache[shareData.shareId]) {
                return false;
            }
        }

        const headers = {
            ...this.baseHeader,
            Cookie: this.cookie || ''
        };

        const tokenData = this.shareTokenCache[shareData.shareId];

        try {
            const transferResp = await this.api(`share/transfer?shareid=${tokenData.shareid}&from=${tokenData.uk}&sekey=${tokenData.randsk}&ondup=newcopy&async=1&channel=chunlei&web=1&app_id=250528`, {
                path: `/${this.saveDirName}`,
                fsidlist: JSON.stringify([fileFsId]),
            }, {
                headers
            }, 'post');

            if (transferResp.errno === 0) {
                return true;
            } else if (transferResp.errno === 113) {
                return true;
            } else if (transferResp.errno === -62 || transferResp.errno === -9) {
                delete this.shareTokenCache[shareData.shareId];
                return false;
            } else {
                return false;
            }
        } catch (error) {
            return false;
        }
    }

    delay(ms) {
        // 延迟函数
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async clearSaveDir() {
        // 清理保存目录
        if (!this.cookie) {
            return;
        }

        if (!this.saveDirId) {
            this.saveDirId = await this.createSaveDir();
            if (!this.saveDirId) {
                return;
            }
        }

        const getBdstoken = () => {
            // 从完整的 cookie 字符串中获取 bdstoken
            const fullCookie = this.cookie;
            if (!fullCookie) return null;

            const cookieParts = fullCookie.split(';');
            for (const part of cookieParts) {
                const trimmed = part.trim();
                if (trimmed.startsWith('bdstoken=')) {
                    return trimmed.substring('bdstoken='.length);
                }
            }
            return null;
        };

        let bdstoken = getBdstoken();
        if (!bdstoken) {
            try {
                const userInfo = await this.api('api/gettemplatevariable?clienttype=0&app_id=250528&web=1&fields=["bdstoken","token","uk","isdocuser","servertime"]', {}, {Cookie: this.cookie}, 'get');
                if (userInfo && userInfo.result && userInfo.result.bdstoken) {
                    bdstoken = userInfo.result.bdstoken;
                }
            } catch (error) {
                return;
            }
        }

        if (!bdstoken) {
            return;
        }

        try {
            const listResp = await this.api('api/list', {
                dir: `/${this.saveDirName}`,
                order: 'time',
                desc: 1,
                showempty: 0,
                web: 1,
                app_id: 250528,
                channel: 'chunlei'
            }, {Cookie: this.cookie}, 'get');

            if (listResp.errno !== 0) {
                return;
            }

            if (!listResp.list || listResp.list.length === 0) {
                return;
            }

            const headers = {
                'User-Agent': 'netdisk;1.4.2;22021211RC;android-android;12;JSbridge4.4.0;jointBridge;1.1.0;',
                Cookie: this.cookie || ''
            };

            const filePaths = listResp.list.map(item => `/${this.saveDirName}/${item.server_filename}`);
            const deleteResp = await this.api('api/filemanager?opera=delete', {
                filelist: JSON.stringify(filePaths),
                bdstoken: bdstoken
            }, headers, 'post');

            if (deleteResp.errno === 0) {
                console.log('清理保存目录成功');
            }
        } catch (error) {
            console.log('清理保存目录失败:', error.message);
            return;
        }
    }
}

export const Baidu = new BaiduHandler();