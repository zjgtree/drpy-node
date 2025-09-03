/*
@header({
  searchable: 1,
  filterable: 1,
  quickSearch: 0,
  title: '多多[盘]',
  lang: 'ds'
})
*/


let {formatPlayUrl} = misc;
let aliTranscodingCache = {};
let aliDownloadingCache = {};

var rule = {
    title: '多多[盘]',
    host: 'https://tv.yydsys.top',
    url: '/index.php/vod/show/id/fyfilter.html',
    filter_url: '{{fl.cateId}}{{fl.area}}{{fl.by or "/by/time"}}{{fl.class}}{{fl.lang or "/lang/国语"}}{{fl.letter}}/page/fypage{{fl.year}}',
    searchUrl: '/index.php/vod/search/page/fypage/wd/**.html',
    filter: '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',
    filter_def: {
        1: {
            cateId: '1'
        },
        2: {
            cateId: '2'
        },
        3: {
            cateId: '3'
        },
        4: {
            cateId: '4'
        },
        5: {
            cateId: '5'
        },
        20: {
            cateId: '20'
        }
    },
    headers: {
        "User-Agent": "PC_UA",
        'Accept': 'text/html; charset=utf-8'
    },
    cate_exclude: '网址|专题|全部影片',
    tab_rename: {
        'KUAKE1': '夸克1',
        'KUAKE11': '夸克2',
        'YOUSEE1': 'UC1',
        'YOUSEE11': 'UC2',
    },
    //线路排序
    line_order: ['百度', '优汐', '夸克'],
    play_parse: true,
    search_match: true,
    searchable: 1,
    filterable: 1,
    timeout: 30000,
    quickSearch: 0,
    class_name: '电影&剧集&动漫&综艺&记录',
    class_url: '1&2&4&3&5&20',
    class_parse: async () => {
    },
    预处理: async () => {
        // await Quark.initQuark()
        return []
    },

    推荐: async function () {
        let {input, pdfa, pdfh, pd} = this;
        let html = await request(input);
        let d = [];
        let data = pdfa(html, '.module-items .module-item');
        data.forEach(it => {
            let title = pdfh(it, 'a&&title');
            d.push({
                title: title,
                img: pd(it, 'img&&data-src'),
                desc: pdfh(it, '.module-item-text&&Text'),
                url: pd(it, 'a&&href')
            });
        });
        return setResult(d);
    },

    一级: async function () {
        let {input, pdfa, pdfh, pd} = this;
        let html = await request(input);
        let d = [];
        let data = pdfa(html, '.module-items .module-item');
        data.forEach(it => {
            let title = pdfh(it, 'a&&title');
            d.push({
                title: title,
                img: pd(it, 'img&&data-src'),
                desc: pdfh(it, '.module-item-text&&Text'),
                url: pd(it, 'a&&href')
            });
        });
        return setResult(d);
    },
    二级: async function (ids) {
        try {
            console.log("开始加载二级内容...");
            let loadStartTime = Date.now();

            let {input, pdfa, pdfh, pd} = this;
            let html = await request(input);
            let data = pdfa(html, '.module-row-title');

            let vod = {
                vod_name: pdfh(html, '.video-info&&h1&&Text') || '',
                type_name: pdfh(html, '.tag-link&&Text') || '',
                vod_pic: pd(html, '.lazyload&&data-original||data-src||src') || '',
                vod_content: pdfh(html, '.sqjj_a--span&&Text') || '',
                vod_remarks: pdfh(html, '.video-info-items:eq(3)&&Text') || '',
                vod_year: pdfh(html, '.tag-link:eq(2)&&Text') || '',
                vod_area: pdfh(html, '.tag-link:eq(3)&&Text') || '',
                vod_actor: pdfh(html, '.video-info-actor:eq(1)&&Text') || '',
                vod_director: pdfh(html, '.video-info-actor:eq(0)&&Text') || ''
            };

            let playform = [];
            let playurls = [];
            let playPans = [];

            // 按网盘类型计数
            let panCounters = {
                '夸克': 1,
                '优汐': 1,
                '百度': 1
            };

            // 收集所有线路信息
            let allLines = [];

            for (let item of data) {
                let link = pd(item, 'p&&Text').trim();
                if (/pan.quark.cn/.test(link)) {
                    playPans.push(link);
                    let shareData = await Quark.getShareData(link);
                    if (shareData) {
                        let videos = await Quark.getFilesByShareUrl(shareData);
                        if (videos.length > 0) {
                            let lineName = '夸克#' + panCounters.夸克;
                            let playUrl = videos.map((v) => {
                                let list = [shareData.shareId, v.stoken, v.fid, v.share_fid_token, v.subtitle ? v.subtitle.fid : '', v.subtitle ? v.subtitle.share_fid_token : ''];
                                return v.file_name + '$' + list.join('*');
                            }).join('#');
                            allLines.push({name: lineName, url: playUrl, type: '夸克'});
                            panCounters.夸克++;
                        } else {
                            let lineName = '夸克#' + panCounters.夸克;
                            allLines.push({name: lineName, url: "资源已经失效，请访问其他资源", type: '夸克'});
                            panCounters.夸克++;
                        }
                    }
                } else if (/drive.uc.cn/i.test(link)) {
                    playPans.push(link);
                    let shareData = await UC.getShareData(link);
                    if (shareData) {
                        let videos = await UC.getFilesByShareUrl(shareData);
                        if (videos.length > 0) {
                            let lineName = '优汐#' + panCounters.优汐;
                            let playUrl = videos.map((v) => {
                                let list = [shareData.shareId, v.stoken, v.fid, v.share_fid_token, v.subtitle ? v.subtitle.fid : '', v.subtitle ? v.subtitle.share_fid_token : ''];
                                return v.file_name + '$' + list.join('*');
                            }).join('#');
                            allLines.push({name: lineName, url: playUrl, type: '优汐'});
                            panCounters.优汐++;
                        } else {
                            let lineName = '优汐#' + panCounters.优汐;
                            allLines.push({name: lineName, url: "资源已经失效，请访问其他资源", type: '优汐'});
                            panCounters.优汐++;
                        }
                    }
                } else if (/baidu/i.test(link)) {
                    playPans.push(link);
                    let shareData = await Baidu.getShareData(link);
                    if (shareData) {
                        let files = await Baidu.getFilesByShareUrl(shareData);
                        if (files.videos && files.videos.length > 0) {
                            let lineName = `百度#${panCounters.百度}`;
                            let playUrl = files.videos.map(v =>
                                `${v.file_name}$${[shareData.shareId, v.fid, v.file_name].join('*')}`
                            ).join('#');
                            allLines.push({name: lineName, url: playUrl, type: '百度'});
                            panCounters.百度++;
                        } else {
                            let lineName = `百度#${panCounters.百度}`;
                            allLines.push({name: lineName, url: "资源已经失效，请访问其他资源", type: '百度'});
                            panCounters.百度++;
                        }
                    }
                }
            }

            // 按照line_order排序
            allLines.sort((a, b) => {
                let aIndex = rule.line_order.indexOf(a.type);
                let bIndex = rule.line_order.indexOf(b.type);
                if (aIndex === -1) aIndex = Infinity;
                if (bIndex === -1) bIndex = Infinity;
                return aIndex - bIndex;
            });

            // 提取排序后的结果
            playform = allLines.map(line => line.name);
            playurls = allLines.map(line => line.url);

            vod.vod_play_from = playform.join("$$$");
            vod.vod_play_url = playurls.join("$$$");
            vod.vod_play_pan = playPans.join("$$$");

            let loadEndTime = Date.now();
            let loadTime = (loadEndTime - loadStartTime) / 1000;
            console.log(`二级内容加载完成，耗时: ${loadTime.toFixed(2)}秒`);

            return vod;
        } catch (error) {
            console.error(`❌ 二级函数执行出错: ${error.message}`);
            return {
                vod_name: '加载失败',
                type_name: '错误',
                vod_pic: '',
                vod_content: `加载失败: ${error.message}`,
                vod_remarks: '请检查网络或配置',
                vod_play_from: '加载错误$$$所有链接无效',
                vod_play_url: `错误信息: ${error.message}$$$请重试或检查配置`,
                vod_play_pan: ''
            };
        }
    },

    搜索: async function () {
        let {input, pdfa, pdfh, pd, KEY} = this;
        let html = await request(input);
        let d = [];
        let data = pdfa(html, '.module-items .module-search-item');
        data.forEach(it => {
            let title = pdfh(it, '.video-info&&a&&title');
            if (rule.search_match) {
                data = data.filter(it => {
                    return title && new RegExp(KEY, "i").test(title);
                });
            }
            d.push({
                title: title,
                img: pd(it, 'img&&data-src'),
                desc: pdfh(it, '.module-item-text&&Text'),
                url: pd(it, 'a&&href')
            });
        });
        return setResult(d);
    },
    lazy: async function (flag, id, flags) {
        let {input, mediaProxyUrl} = this;
        let ids = input.split('*');
        let urls = [];
        let UCDownloadingCache = {};
        let UCTranscodingCache = {};
        if (flag.startsWith('夸克')) {
            console.log("夸克网盘解析开始")
            let down = await Quark.getDownload(ids[0], ids[1], ids[2], ids[3], true);
            let headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'origin': 'https://pan.quark.cn',
                'referer': 'https://pan.quark.cn/',
                'Cookie': Quark.cookie
            };
            urls.push("原画", down.download_url + '#fastPlayMode##threads=10#')
            urls.push("原代服", mediaProxyUrl + `?thread=${ENV.get('thread') || 6}&form=urlcode&randUa=1&url=` + encodeURIComponent(down.download_url) + '&header=' + encodeURIComponent(JSON.stringify(headers)))
            if (ENV.get('play_local_proxy_type', '1') === '2') {
                urls.push("原代本", `http://127.0.0.1:7777/?thread=${ENV.get('thread') || 6}&form=urlcode&randUa=1&url=` + encodeURIComponent(down.download_url) + '&header=' + encodeURIComponent(JSON.stringify(headers)));
            } else {
                urls.push("原代本", `http://127.0.0.1:5575/proxy?thread=${ENV.get('thread') || 6}&chunkSize=256&url=` + encodeURIComponent(down.download_url));
            }
            let transcoding = (await Quark.getLiveTranscoding(ids[0], ids[1], ids[2], ids[3])).filter((t) => t.accessable);
            transcoding.forEach((t) => {
                urls.push(t.resolution === 'low' ? "流畅" : t.resolution === 'high' ? "高清" : t.resolution === 'super' ? "超清" : t.resolution, t.video_info.url)
            });
            return {
                parse: 0,
                url: urls,
                header: headers
            }
        } else if (flag.startsWith('优汐')) {
            console.log("优汐网盘解析开始");
            if (!UCDownloadingCache[ids[1]]) {
                let down = await UC.getDownload(ids[0], ids[1], ids[2], ids[3], true);
                if (down) UCDownloadingCache[ids[1]] = down;
            }
            let downCache = UCDownloadingCache[ids[1]];
            return await UC.getLazyResult(downCache, mediaProxyUrl)
        } else if (flag.startsWith('百度')) {
            console.log("百度网盘解析开始");
            let down = await Baidu.getDownload(ids[0], ids[1], ids[2]);
            let headers = {
                'User-Agent': 'netdisk;1.4.2;22021211RC;android-android;12;JSbridge4.4.0;jointBridge;1.1.0;',
                'Referer': 'https://pan.baidu.com'
            };
            urls.push("原画", `${down.dlink}`);
            urls.push("原代本", `http://127.0.0.1:7777/?thread=${ENV.get('thread') || 60}&form=urlcode&randUa=1&url=${encodeURIComponent(down.dlink)}`);
            return {
                parse: 0,
                url: urls,
                header: headers
            };
        }
    }
}