/*
@header({
  searchable: 2,
  filterable: 1,
  quickSearch: 2,
  title: 'TVB云播',
  lang: 'ds'
})
*/

var rule = {
    title: 'TVB云播',
    类型: '影视',
    host: 'http://www.hktvyb.vip',
    //host: 'http://www.tvyun03.com',
    hostJs: async function () {
        let {HOST} = this;
        let html = await request(HOST, {headers: {'User-Agent': 'UC_UA'}});
        HOST = jsp.pdfh(html, 'a&&href');
        return HOST;
    },
    url: 'vod/show/id/fyfilter.html',
    filterable: 1,//是否启用分类筛选,
    filter_url: '{{fl.cateId}}{{fl.area}}{{fl.by}}{{fl.class}}{{fl.lang}}{{fl.letter}}/page/fypage{{fl.year}}',
    class_name: '电影&电视剧&综艺&动漫',
    class_url: '1&2&3&4',
    filter: 'H4sIAAAAAAAAA+2Z7VIiRxSG74XfVjGDrh97B7mG1P5gN1SyFWOq1KTK2rJKRRDUCFouLgt+ZUXQiIIao0OQm5nuGe4iA92cPn3GWsbSpDYJP33O6+nutxv6ZeZdyAy9/Ppd6PvYXOhl6E10NvbVN6Gh0FT0h5j3t1NvsL017++fo5M/xbrCKQ+zRKUdr3Sw94cZmh+SeLViN4tOekVWRlUlV2TpsqqMQcVJ1Xk8oSrjqlLeZHcNVZmACl/M8oWcqpiGGihd1tqZanY89cG20qgUCc2/6hTl0iejMzNq5aLR51dOlidpuNspLJm+Tl0imb4sXSKZ7jAZSDDdNjKQYLpJpItgullkLoL1JG71mK2f6hLJYC6rF06TSCRDK3K2G74VdRhISiu+FUkG060e2/cHZLqCQZfkVjt/QroIBl32Tr01ki6CgWTpzMltEolgIImv8qWPRCIY+NLIsMQt8UWwnqS9u8U/lHSJZDBQbsVNW2QgwWDR9+fO9u+sWSfrBgzCzJH7iR4JwUCykWSZSyIRDI5EK+vtHTkSgqltKPLdTboNXQaS5ZbzG1m6ZGBgc9NpFB9amlbBn+/odCyKPt7FGlu3gn68j8rtfLI3TqdRWCLYreM8v73QFBIpg2v87l7vIRCs6X6DFZqaQiLY8Kv3VCERbMBanSokgh47JV4803sIBGvZP6E9JFKn6g+qkEjNtOafaU3r8UuNWcd6D4Ggx3LGc5mlTvQ2QGHNpZaTqTrpvL5soOqb5oCvtbx/1gcFCrrEjd3I6SKB8HGajE59q46Te1F1KwtBj1Oh6el7A3QahSVC20gVEsFhuTyiConQNlKFROgoUIVE6MD5FAKho+Bbi0DITnYe1xUCYTvnYtFp9Om8u7YbzYB2RozISK99p024C1B1mFaHcTVCqxFcNWnVxFWDVg1UNSdI1ZzA1XFaHcfVMVodw9VRWh3F1Re0+gJXqVcm9sqkXpnYK5N6ZWKvTOqVib0yqVcm9sqgXhnYK4N6ZWCvDOqVgb0yqFcG9sqgXhnYK4N65QF8aF/PqSPLN7aYlQl4ZPnOTXvnutf89Vx49q3XpFe1LYvXtlH1u7ezM+q74WKZpZKoOvPmx+lYZ16vhkKRJ2b5CP6Ssq2ySrXoIHjXmnd1odII/krp3BWqpOzkZ+XOdaZKo88Xv/uHlwBxii3esHiGdBHsETmfnd8wq0okgj0uFffL+QFScYCcHyDUBQir9t2hL9RJplJxgucvdIlkMJf3SV/8lgzlPt8GSPbw9S27+O/vp8TBZMLT6wFBoOAR6jkCY/8oFyRS9gtqASJlrualKLZ7qLcB+rhgNUgCgyTwr0sC/4tfA8GS/JcXioZxKHpCzGgvpJ3yAskQguFbbnnff8t5DKZ63nJrKV0iGXTZqvJVElYkU2Yl+C25lCVTW35l32XJdAVD90P7E5muZCCxTtn5HpEIBnMpXPqfQwkGXbb3+TV9KCmYSpW3PJWxrS3fEyStAjZe/+qFEGKjYNCxvuQurpNegv1jSUBkZf1iFEiPzPQW7yA9OesKgQZfQYOHCYMI8d+IEF/evTnyTPdmgEsxwEsrJ151D8ntKxkMtFFxskkykGAgye45Z/T9jWDqS73viyI3u+tukLdjksFAB4esQJ4DSPaIH/m8aPnfSAkGc+n/ziXAyzxW88y+JnMRDEtKV36Jx2CPju7tP8mrL8nUA4d9liqQLoKpI3vJqiS4SAYDFVZ5nkQOyZS7ddbaoe522cO3yd/yqKD7FE0PCAIF/xH/mev/UT+sBwFhEBAGAWEQEJ4rIMz/BZ2B9n47JAAA',
    filter_def: {
        1: {cateId: '1'},
        2: {cateId: '2'},
        3: {cateId: '3'},
        4: {cateId: '4'}
    },
    searchUrl: '/vod/search/page/fypage/wd/**.html',
    searchable: 2,
    quickSearch: 2,
    double: true,
    play_parse: true,

    limit: 6,
    lazy: async function () {
        let {input, pdfa, pdfh, pd} = this
        const html = JSON.parse((await req(input)).content.match(/r player_.*?=(.*?)</)[1]);
        let url = html.url;
        if (html.encrypt == "1") {
            url = unescape(url)
            return {parse: 0, url: url}
        } else if (html.encrypt == "2") {
            url = unescape(base64Decode(url))
            return {parse: 0, url: url}
        }
        if (/m3u8|mp4/.test(url)) {
            input = url
            return {parse: 0, url: input}
        } else {
            return {parse: 1, url: input}
        }
    },
    async 推荐() {
        let {input, pdfa, pdfh, pd} = this;
        let html = await request(input);
        let d = [];
        let data = pdfa(html, 'ul.myui-vodlist li');
        data.forEach((it) => {
            d.push({
                title: pdfh(it, 'a&&title'),
                pic_url: pd(it, '.lazyload&&data-original'),
                desc: pdfh(it, '.tag&&Text'),
                url: pd(it, 'a&&href'),
            })
        });
        return setResult(d)
    },
    async 一级(tid, pg, filter, extend) {
        let {input, pdfa, pdfh, pd} = this;
        let html = await request(input);
        let d = [];
        let data = pdfa(html, '.myui-vodlist__box');
        data.forEach((it) => {
            d.push({
                title: pdfh(it, 'a&&title'),
                pic_url: pd(it, '.lazyload&&data-original'),
                desc: pdfh(it, '.tag&&Text'),
                url: pd(it, 'a&&href'),
            })
        });
        return setResult(d)
    },
    async 搜索(wd, quick, pg) {
        let {input, pdfa, pdfh, pd} = this;
        let html = await request(input);
        let d = [];
        let data = pdfa(html, 'ul.myui-vodlist__media li');
        data.forEach((it) => {
            d.push({
                title: pdfh(it, 'a&&title'),
                pic_url: pd(it, '.lazyload&&data-original'),
                desc: pdfh(it, '.detail--h4&&Text'),
                url: pd(it, 'a&&href'),
                content: pdfh(it, 'span.text-muted&&Text'),
            })
        });
        return setResult(d)
    },
    async 二级(ids) {
        let {input, pdfa, pdfh, pd} = this;
        let html = await request(input);
        let VOD = {};
        VOD.vod_name = pdfh(html, 'h1&&Text');
        VOD.vod_content = pdfh(html, '.text-collapse span&&Text');
        let playlist = pdfa(html, '.myui-content__list')
        let tabs = pdfa(html, 'h3:gt(0)');
        let playmap = {};
        tabs.map((item, i) => {
            const form = pdfh(item, 'Text')
            const list = playlist[i]
            const a = pdfa(list, 'body&&a:not(:contains(简介))')
            a.map((it) => {
                let title = pdfh(it, 'a&&Text')
                let urls = pd(it, 'a&&href', input)
                if (!playmap.hasOwnProperty(form)) {
                    playmap[form] = [];
                }
                playmap[form].push(title + "$" + urls);
            });
        });
        VOD.vod_play_from = Object.keys(playmap).join('$$$');
        const urls = Object.values(playmap);
        const playUrls = urls.map((urllist) => {
            return urllist.join("#")
        });
        VOD.vod_play_url = playUrls.join('$$$');
        return VOD
    },
}
