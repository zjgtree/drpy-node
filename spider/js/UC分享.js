/*
@header({
  searchable: 2,
  filterable: 0,
  quickSearch: 0,
  title: 'UC合集'
})
*/

globalThis.getobj = {};
var rule = {
    author: '迈克,道长',
    title: 'UC合集',
    host: 'https://pc-api.uc.cn',
    url: '/1/clouddrive/share/sharepage/token?pr=UCBrowser&fr=pc',
    searchable: 2,
    searchUrl: '**',
    quickSearch: 0,
    homeListCol: "avatar",
    hikerClassListCol: "avatar",
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.12-a038f7b798 Safari/537.36 Channel/pckk_other_ch',
        'Referer': 'https://drive.uc.cn/',
        'Content-Type': 'application/json',
        'Cookie': ''
    },
    play_parse: true,
    lazy: async function (id) {
        let {input, mediaProxyUrl} = this;

        function delay(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        }

        let stoken = input.split('?')[1]
        let fg = input.split('?')[0]
        fg = fg.split('|')

        async function save(fg) {
            if (fg[0] == 'self') {
                let save_as_top_fids = fg[1]
                return save_as_top_fids
            } else {
                if (!getobj['pdir']) {
                    let pdirpath = '/1/clouddrive/share/sharepage/dir?pr=UCBrowser&fr=pc&aver=1'
                    let pdirdata = await getdata(pdirpath, 'GET', '')
                    getobj['pdir'] = pdirdata
                }
                let pdir = getobj['pdir']
                let saveid = pdir.data.dir.fid
                getobj['saveid'] = saveid
                let body = {
                    "fid_list": [fg[1]],
                    "fid_token_list": [fg.slice(-1)[0].toString()],
                    "to_pdir_fid": pdir.data.dir.fid,
                    "pwd_id": fg[0],
                    "stoken": stoken || getobj[fg[0]].stoken,
                    "pdir_fid": pdir.data.dir.pdir_fid
                }
                log(body)
                let task_path = '/1/clouddrive/share/sharepage/save?pr=UCBrowser&fr=pc'
                let task_id = await getdata(task_path, 'POST', body)
                task_id = task_id.data.task_id
                if (task_id) {
                    let retry = 0;
                    while (true) {
                        let datapath = `/1/clouddrive/task?pr=UCBrowser&fr=pc&task_id=${task_id}&retry_index=${retry}`
                        let result = await getdata(datapath, 'GET', '')
                        let data = result.data.save_as.save_as_top_fids
                        if ((data.length > 0)) {
                            let save_as_top_fids = data[0]
                            return save_as_top_fids
                        }
                        retry++;
                        if (retry > 9) break;
                        await delay(1000);
                    }
                }
                return true;
            }
        }

        async function downloadvideo(save_as_top_fids) {
            let body1 = {
                'fids': [save_as_top_fids]
            }
            let pldpath = HOST + '/1/clouddrive/file/download?pr=UCBrowser&fr=pc'
            let pldata = await reqCookie(pldpath, {headers: rule.headers, body: body1, method: 'POST'})
            log(pldata)
            return pldata
        }

        async function deletesave(save_as_top_fids) {
            let saveid = getobj['saveid']
            let scurl = `/1/clouddrive/file/sort?pr=UCBrowser&fr=pc&pdir_fid=${saveid}&_page=1&_size=200&_sort=file_type:asc,updated_at:desc`
            const listData = await getdata(scurl, 'GET', '')
            if (listData.data && listData.data.list && listData.data.list.length > 0) {
                const del = await getdata(`/1/clouddrive/file/delete?pr=UCBrowser&fr=pc`, 'POST', {
                    action_type: 2,
                    filelist: listData.data.list.filter((v) => v !== save_as_top_fids).map((v) => v.fid),
                    exclude_fids: [],
                });
                log(del);
            }
        }

        cookie = ENV.get("uc_cookie")
        log(cookie)

        function CookieManage(cookie) {
            this.cookie = {};
            this.add(cookie);
        }

        Object.assign(CookieManage.prototype, {
            add(cookie) {
                let cookies = [];
                if (typeof cookie === "string") {
                    cookies = cookie.split(";");
                } else if (Array.isArray(cookie)) {
                    cookies = cookie;
                }
                cookies.forEach(v => {
                    v = v.split("=");
                    if (v.length < 2) return;
                    let key = v.shift().trim();
                    this.cookie[key] = v.join("=").trim();
                });
            },
            get() {
                return Object.entries(this.cookie).map(v => v[0] + "=" + v[1]).join(";");
            }
        });
        const cookieManage = new CookieManage(cookie);
        let save_as_top_fids = await save(fg)
        let pldata = await downloadvideo(save_as_top_fids)
        //log(pldata.cookie)
        cookieManage.add(pldata.cookie)
        let playcookie = cookieManage.get()
        //log(playcookie)
        let header = Object.assign({}, rule.headers, {Cookie: playcookie});
        delete header['Content-Type'];
        pldata = JSON.parse(pldata.html).data[0]
        let play = []

        if (ENV.get('play_local_proxy_type', '1') === '2') {
            play.push("原代本", `http://127.0.0.1:7777/?thread=${ENV.get('thread') || 6}&form=urlcode&randUa=1&url=` + encodeURIComponent(pldata.download_url) + '&header=' + encodeURIComponent(JSON.stringify(header)))
        } else {
            play.push("原代本", `http://127.0.0.1:5575/proxy?thread=${ENV.get('thread') || 6}&chunkSize=256&url=` + encodeURIComponent(pldata.download_url));
        }
        play.push('原画', pldata.download_url)
        play.push("原代服", mediaProxyUrl + `?thread=${ENV.get('thread') || 6}&form=urlcode&randUa=1&url=` + encodeURIComponent(pldata.download_url) + '&header=' + encodeURIComponent(JSON.stringify(header)))
        if (fg[0] !== 'self') {
            await delay(300)
            await deletesave(save_as_top_fids)
        }
        return {
            parse: 0,
            url: play,
            header: header,
        }

    },
    预处理: async function () {
        getobj['pdir'] = null
        getobj['saveid'] = null
        rule_fetch_params.headers.Cookie = ENV.get("uc_cookie")
    },
    class_parse: async function () {
        function pjson(str) {
            let regex = /\/\*[\s\S]*?\*\//g;
            let st = str.replace(regex, '')
            return dealJson(st)
        }

        let html = await request(rule.params);
        let json = pjson(html);
        let data = json.classes
        let self = {
            "type_name": "我的UC",
            "type_id": "self"
        }
        data.unshift(self)
        for (const item of data) {
            let id = item.type_id.split('|')
            let pwd_id = id[0]
            getobj[pwd_id] = {};
        }
        rule.classes = data;
        return {
            class: rule.classes
        }
    },
    一级: async function () {
        let {MY_CATE, MY_PAGE, publicUrl} = this;
        let ucIcon = urljoin(publicUrl, './images/icon_cookie/UC.png');
        let vodd = []
        let catecache = MY_CATE.split('|')
        let pg = MY_PAGE
        let c = Object.assign({}, rule.headers)
        let pwd_id = catecache[0].toString()
        let h = (pwd_id === 'self' ? c : (delete c['Cookie'], c))
        let fileid = catecache[1]
        let pwd = catecache[2]
        let lbsz = await datalist(fileid, pwd_id, pwd, pg, h)
        lbsz.forEach(it => {
            let ppp = (it.category == 1 || it.category == 2)
            let qqq = it.category === 0
            let isVideoType = ppp || qqq
            let xxx = `${pwd_id}${'|'}${it.fid}${'|'}${pwd}`
            let enji = `${xxx}${'|'}${it.file_name}` + (it.share_fid_token ? (`${'|'}${it.share_fid_token}`) : '') + '?' + getobj[pwd_id].stoken
            if (isVideoType) {
                let vodItem = {
                    vod_id: ppp ? enji : xxx,
                    vod_name: it.file_name,
                    vod_tag: ppp ? '' : 'folder',
                    vod_pic: ppp ? ((pwd_id === 'self') ? '' : it.preview_url) : ucIcon
                }
                vodd.push(vodItem)
            }
        })
        if (pg == 1 && vodd.length > 0) {
            getobj[pwd_id].vod = vodd
        } else if (vodd.length > 0) {
            Array.prototype.push.apply(getobj[pwd_id].vod, vodd)
        }
        VODS = vodd
        return VODS
    },
    二级: async function (ids) {
        let {input} = this
        let xl = [];
        let vod_id = ids[0]
        let infor = vod_id.split('|');
        log(infor)
        if (infor.includes('self')) {
            xl.push(infor[3].toString() + '$' + vod_id)
        } else if (infor.length == 4) {
            let pg = 1
            var lbsz1 = await datalist(infor[1], infor[0], infor[2], pg)
            lbsz1.forEach(item => {
                let category = item.category;
                if (category == 1 || category == 2) {
                    let enji = infor[0] + '|' + item.fid + '|' + item.file_name + (item.share_fid_token ? ('|' + item.share_fid_token) : '') + '?' + getobj[infor[0]].stoken
                    xl.push(item.file_name + '$' + enji)
                }
            })
        } else if (infor.length == 6) {
            xl.push(infor[3].toString() + '$' + vod_id)
        } else {
            let getvod = getobj[infor[0]].vod
            for (const it of getvod) {
                if (it.vod_tag !== 'folder') {
                    xl.push(it.vod_name + '$' + it.vod_id)
                }
            }
        }
        xl = xl.join('#')
        log(xl)
        VOD = {
            vod_name: infor[3].toString(),
            vod_play_from: '原画',
            vod_play_url: xl
        }
        return VOD
    },
    搜索: async function () {
        let {MY_PAGE, KEY} = this;
        let vodd = [];
        let cate = rule.classes;
        cate = cate.map(item => item.type_id)
        for (it of cate) {
            let pg = MY_PAGE
            let pwd_id = it.split('|')[0]
            let fileid = it.split('|')[1]
            let pwd = it.split('|')[2]
            let lbsz = await datalist(fileid, pwd_id, pwd, pg)
            if (lbsz !== '') {
                for (item of lbsz) {
                    let category = item.category;
                    let name = item.file_name.replaceAll('丨', "").replace(/[a-zA-Z]/g, "");
                    log(name)
                    if (name.includes(KEY)) {
                        if (category == 1 || category == 2) {
                            let sji = pwd_id + '|' + item.fid + '|' + pwd + '|' + item.file_name + '|' + item.pdir_fid + (item.share_fid_token ? ('|' + item.share_fid_token) : '') + '?' + getobj[pwd_id].stoken
                            vodd.push({
                                vod_id: sji,
                                vod_name: name,
                                vod_pic: 'https://d.kstore.dev/download/4806/UC.png'
                            })
                        } else {
                            let fid = item.fid
                            let sji = pwd_id + '|' + fid + '|' + pwd + '|' + name;
                            vodd.push({
                                vod_id: sji,
                                vod_name: name,
                                vod_pic: 'https://d.kstore.dev/download/4806/UC.png'
                            })
                            var lbsz1 = await datalist(fid, pwd_id, pwd, pg)
                            lbsz1.forEach(item1 => {
                                let name = item1.file_name;
                                if (/4|集/.test(name) && !/\.mp4|\.mkv/.test(name)) {
                                    //番|花
                                    let sji = pwd_id + '|' + item1.fid + '|' + pwd + '|' + name
                                    vodd.push({
                                        vod_id: sji,
                                        vod_name: KEY + name,
                                        vod_pic: 'https://d.kstore.dev/download/4806/UC.png'
                                    })
                                }
                            })
                        }
                    }
                }
            }
        }
        VODS = vodd;
        return VODS
    },
}

async function getdata(path, meth, body, h) {
    let url = HOST + path
    if (path.startsWith('http')) {
        url = path
    }
    let data = await request(url, {
        method: meth,
        headers: h || rule.headers,
        body: body
    })
    let jsdata = JSON.parse(data)
    return jsdata
}

async function datalist(fileid, pwd_id, pwd, pg, h) {
    let path;
    if (pwd_id !== 'self') {
        let body = {"pwd_id": pwd_id, "passcode": pwd}
        let data = await getdata('/1/clouddrive/share/sharepage/token?pr=UCBrowser&fr=pc', 'POST', body, h)
        if (data.status != 200) {
            return ''
        }
        let stoken = data.data.stoken
        getobj[pwd_id].stoken = stoken
        path = `/1/clouddrive/share/sharepage/detail?pr=UCBrowser&fr=pc&pwd_id=${pwd_id}&stoken=${encodeURIComponent(getobj[pwd_id].stoken)}&pdir_fid=${fileid || ''}&force=0&_page=${pg}&_size=50&_fetch_banner=1&_fetch_share=1&_fetch_total=1&_sort=file_type:asc,file_name:asc`

    } else {
        path = `https://drive.quark.cn/1/clouddrive/file/sort?pr=UCBrowser&fr=pc&uc_param_str=&pdir_fid=${fileid || '0'}&_page=${pg}&_size=50&_fetch_total=1&_fetch_sub_dirs=0&_sort=file_type:asc,file_name:asc`
    }
    let lbdata = await getdata(path, 'GET', '', h)
    log(lbdata)
    return lbdata.data.list;
}
