import '../libs_drpy/jsencrypt.js'
import {ENV} from "./env.js";
import axios from "axios";
import qs from "qs"


class CloudDrive {
    constructor() {
        this.regex = /https:\/\/cloud\.189\.cn\/web\/share\?code=([^&]+)/;//https://cloud.189.cn/web/share?code=qI3aMjqYRrqa
        this.config = {
            clientId: '538135150693412',
            model: 'KB2000',
            version: '9.0.6',
            pubKey: 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCZLyV4gHNDUGJMZoOcYauxmNEsKrc0TlLeBEVVIIQNzG4WqjimceOj5R9ETwDeeSN3yejAKLGHgx83lyy2wBjvnbfm/nLObyWwQD/09CmpZdxoFYCH6rdDjRpwZOZ2nXSZpgkZXoOBkfNXNxnN74aXtho2dqBynTw3NFTWyQl8BQIDAQAB',
        };
        this.headers = {
            'User-Agent': `Mozilla/5.0 (Linux; U; Android 11; ${this.config.model} Build/RP1A.201005.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/74.0.3729.136 Mobile Safari/537.36 Ecloud/${this.config.version} Android/30 clientId/${this.config.clientId} clientModel/${this.config.model} clientChannelId/qq proVersion/1.0.6`,
            'Referer': 'https://m.cloud.189.cn/zhuanti/2016/sign/index.jsp?albumBackupOpened=1',
            'Accept-Encoding': 'gzip, deflate',
        };
        this.api = 'https://cloud.189.cn/api',
            this.shareCode = '';
        this.accessCode = '';
        this.shareId = '';
        this.shareMode = '';
        this.isFolder = '';
        this.index = 0;
    }

    // 初始化方法，加载本地配置
    async init() {
        if (this.account) {
            console.log('天翼账号获取成功：' + this.account)
        }
        if (this.password) {
            console.log('天翼密码获取成功：' + this.password)
        }
        if (this.cookie) {
            console.log('天翼cookie获取成功' + this.cookie)
        } else {
            ENV.set('cloud_cookie', await this.login(this.account, this.password))
        }
    }

    get account() {
        return ENV.get('cloud_account')
    }

    get password() {
        return ENV.get('cloud_password')
    }

    get cookie() {
        return ENV.get('cloud_cookie')
    }

    async login(uname, passwd) {
        try {
            let resp = await axios.post('https://open.e.189.cn/api/logbox/config/encryptConf.do?appId=cloud');
            let pubKey = resp.data.data.pubKey;
            resp = await axios.get('https://cloud.189.cn/api/portal/loginUrl.action?redirectURL=https://cloud.189.cn/web/redirect.html?returnURL=/main.action');
            // 获取最后请求url中的参数reqId和lt
            let Reqid = resp.request.path.match(/reqId=(\w+)/)[1];
            let Lt = resp.request.path.match(/lt=(\w+)/)[1];
            let tHeaders = {
                "Content-Type": "application/x-www-form-urlencoded",
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:74.0) Gecko/20100101 Firefox/76.0',
                'Referer': 'https://open.e.189.cn/', Lt, Reqid,
            };
            let data = {version: '2.0', appKey: 'cloud'};
            resp = await axios.post('https://open.e.189.cn/api/logbox/oauth2/appConf.do', qs.stringify(data), {headers: tHeaders});
            let returnUrl = resp.data.data.returnUrl;
            let paramId = resp.data.data.paramId;
            const keyData = `-----BEGIN PUBLIC KEY-----\n${pubKey}\n-----END PUBLIC KEY-----`;
            const jsencrypt = new JSEncrypt();
            jsencrypt.setPublicKey(keyData);
            const enUname = Buffer.from(jsencrypt.encrypt(uname), 'base64').toString('hex');
            const enPasswd = Buffer.from(jsencrypt.encrypt(passwd), 'base64').toString('hex');
            data = {
                appKey: 'cloud',
                version: '2.0',
                accountType: '01',
                mailSuffix: '@189.cn',
                validateCode: '',
                returnUrl,
                paramId,
                captchaToken: '',
                dynamicCheck: 'FALSE',
                clientType: '1',
                cb_SaveName: '0',
                isOauth2: false,
                userName: `{NRP}${enUname}`,
                password: `{NRP}${enPasswd}`,
            };
            resp = await axios.post('https://open.e.189.cn/api/logbox/oauth2/loginSubmit.do', qs.stringify(data), {
                headers: tHeaders,
                validateStatus: null
            });
            if (resp.data.toUrl) {
                let cookies = resp.headers['set-cookie'].map(it => it.split(';')[0]).join(';');
                resp = await axios.get(resp.data.toUrl, {
                    headers: {...this.headers, Cookie: cookies},
                    maxRedirects: 0,
                    validateStatus: null
                });
                cookies += '; ' + resp.headers['set-cookie'].map(it => it.split(';')[0]).join(';');
                ENV.set('cloud_cookie', cookies)
            } else {
                console.error('Error during login:', resp.data);
            }
        } catch (error) {
            console.error('Error during login:', error);
        }
    }

    async getShareID(url, accessCode) {
        const matches = this.regex.exec(url);
        if (matches && matches[1]) {
            this.shareCode = matches[1];
            const accessCodeMatch = this.shareCode.match(/访问码：([a-zA-Z0-9]+)/);
            this.accessCode = accessCodeMatch ? accessCodeMatch[1] : '';
        } else {
            const matches_ = url.match(/https:\/\/cloud\.189\.cn\/t\/([^&]+)/);
            this.shareCode = matches_ ? matches_[1] : null;
            const accessCodeMatch = this.shareCode.match(/访问码：([a-zA-Z0-9]+)/);
            this.accessCode = accessCodeMatch ? accessCodeMatch[1] : '';
        }
        if (accessCode) {
            this.accessCode = accessCode
        }
    }

    async getShareData(shareUrl, accessCode) {
        let file = {}
        let fileData = []
        let fileId = await this.getShareInfo(shareUrl, accessCode)
        if (fileId) {
            let fileList = await this.getShareList(fileId);
            if (fileList && Array.isArray(fileList)) {
                await Promise.all(fileList.map(async (item) => {
                    if (!(item.name in file)) {
                        file[item.name] = [];
                    }
                    const fileData = await this.getShareFile(item.id);
                    if (fileData && fileData.length > 0) {
                        file[item.name].push(...fileData);
                    }
                }));
            } else {
                file['root'] = await this.getShareFile(fileId)
            }
        }
        // 过滤掉空数组
        for (let key in file) {
            if (file[key].length === 0) {
                delete file[key];
            }
        }
        // 如果 file 对象为空，重新获取 root 数据并过滤空数组
        if (Object.keys(file).length === 0) {
            file['root'] = await this.getShareFile(fileId);
            if (file['root'] && Array.isArray(file['root'])) {
                file['root'] = file['root'].filter(item => item && Object.keys(item).length > 0);
            }
        }
        return file;
    }

    async getShareInfo(shareUrl, accessCode) {
        if (shareUrl.startsWith('http')) {
            await this.getShareID(shareUrl, accessCode);
        } else {
            this.shareCode = shareUrl;
        }
        try {
            if (accessCode) {
                let check = await axios.get(`${this.api}/open/share/checkAccessCode.action?shareCode=${this.shareCode}&accessCode=${this.accessCode}`, {
                    headers: {
                        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                        'accept': 'application/json;charset=UTF-8',
                        'accept-encoding': 'gzip, deflate, br, zstd',
                        'accept-language': 'zh-CN,zh;q=0.9',
                    }
                })
                if (check.status === 200) {
                    this.shareId = check.data.shareId;
                }
                let resp = await axios.get(`${this.api}/open/share/getShareInfoByCodeV2.action?key=noCache&shareCode=${this.shareCode}`,
                    {
                        headers: {
                            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                            'accept': 'application/json;charset=UTF-8',
                            'accept-encoding': 'gzip, deflate, br, zstd',
                            'accept-language': 'zh-CN,zh;q=0.9',
                        }
                    });
                let fileId = resp.data.fileId;
                this.shareMode = resp.data.shareMode;
                this.isFolder = resp.data.isFolder;
                return fileId;
            } else {
                let resp = await axios.get(`${this.api}/open/share/getShareInfoByCodeV2.action?key=noCache&shareCode=${this.shareCode}`,
                    {
                        headers: {
                            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                            'accept': 'application/json;charset=UTF-8',
                            'accept-encoding': 'gzip, deflate, br, zstd',
                            'accept-language': 'zh-CN,zh;q=0.9',
                        }
                    });
                let fileId = resp.data.fileId;
                this.shareId = resp.data.shareId;
                this.shareMode = resp.data.shareMode;
                this.isFolder = resp.data.isFolder;
                return fileId;
            }

        } catch (error) {
            console.error('Error during getShareInfo:', error);
        }
    }

    async getShareList(fileId) {
        try {
            let videos = []
            const headers = new Headers();
            headers.append('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
            headers.append('Accept', 'application/json;charset=UTF-8');
            headers.append('Accept-Encoding', 'gzip, deflate, br, zstd');
            const options = {
                method: 'GET',
                headers: headers
            };
            let resp = await _fetch(`${this.api}/open/share/listShareDir.action?key=noCache&pageNum=1&pageSize=60&fileId=${fileId}&shareDirFileId=${fileId}&isFolder=${this.isFolder}&shareId=${this.shareId}&shareMode=${this.shareMode}&iconOption=5&orderBy=lastOpTime&descending=true&accessCode=${this.accessCode}&noCache=${Math.random()}`, options)
            let json = JsonBig.parse(await resp.text());
            const data = json?.fileListAO;
            let folderList = data?.folderList
            if (!folderList) {
                return null
            }
            let names = folderList.map(item => item.name)
            let ids = folderList.map(item => item.id);
            if (folderList && folderList.length > 0) {
                names.forEach((name, index) => {
                    videos.push({
                        name: name,
                        id: ids[index],
                        type: 'folder'
                    })
                });
                let result = await Promise.all(ids.map(async (id) => this.getShareList(id)))
                result = result.filter(item => item !== undefined && item !== null);
                return [...videos, ...result.flat()];
            }
        } catch (e) {
            console.log(e)
        }
    }

    async getShareFile(fileId) {
        try {
            const headers = new Headers();
            headers.append('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
            headers.append('Accept', 'application/json;charset=UTF-8');
            headers.append('Accept-Encoding', 'gzip, deflate, br, zstd');
            const options = {
                method: 'GET',
                headers: headers
            };
            let resp = await _fetch(`${this.api}/open/share/listShareDir.action?key=noCache&pageNum=1&pageSize=60&fileId=${fileId}&shareDirFileId=${fileId}&isFolder=${this.isFolder}&shareId=${this.shareId}&shareMode=${this.shareMode}&iconOption=5&orderBy=lastOpTime&descending=true&accessCode=${this.accessCode}&noCache=${Math.random()}`, options)
            let json = JsonBig.parse(await resp.text());
            let videos = []
            const data = json?.fileListAO;
            let fileList = data.fileList
            if (!fileList) {
                return null
            }
            let filename = fileList.map(item => item.name)
            let ids = fileList.map(item => item.id);
            let count = data.fileListSize
            if (count >= 0) {
                for (let i = 0; i < count; i++) {
                    if (fileList[i].mediaType === 3) {
                        videos.push({
                            name: filename[i],
                            fileId: ids[i],
                            shareId: this.shareId,
                        })
                    }
                }
            }
            return videos
        } catch (e) {
            console.log(e)
        }

    }

    async getShareUrl(fileId, shareId) {
        let headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'application/json;charset=UTF-8',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
        };
        if (!this.cookie && this.account && this.password && this.index < 2) {
            console.log("正在登录，请稍等....")
            await this.login(this.account, this.password);
            console.log("登录成功,获取cookie成功")
        }
        headers['Cookie'] = this.cookie;
        try {
            let resp = await axios.get(`${this.api}/portal/getNewVlcVideoPlayUrl.action?shareId=${shareId}&dt=1&fileId=${fileId}&type=4&key=noCache`, {
                headers: headers
            });

            let location = await axios.get(resp.data.normal.url, {
                maxRedirects: 0, // 禁用自动重定向
                validateStatus: function (status) {
                    return status >= 200 && status < 400; // 只处理 2xx 和 3xx 状态码
                }
            });
            let link = '';
            if (location.status >= 300 && location.status < 400 && location.headers.location) {
                link = location.headers.location;
            } else {
                link = resp.data.normal.url;
            }
            return link;
        } catch (error) {
            if (error.response && error.response.status === 400 && this.index < 2) {
                console.log("获取播放地址失败，错误信息为：" + error.response.data)
                console.log('cookie失效，正在重新获取cookie')
                ENV.set('cloud_cookie', '');
                this.index += 1;
                return await this.getShareUrl(fileId, shareId);
            } else {
                console.error('Error during getShareUrl:', error.message, error.response ? error.response.status : 'N/A');
            }
        } finally {
            if (this.index >= 2) {
                this.index = 0; // 仅在达到最大重试次数后重置
            }
        }
    }
}

export const Cloud = new CloudDrive();
