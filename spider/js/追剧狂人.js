/*
@header({
  searchable: 1,
  filterable: 1,
  quickSearch: 1,
  title: '追剧狂人',
  logo: 'https://i-blog.csdnimg.cn/blog_migrate/2621e710a94ab40ba66645d47f296aaf.gif',
  lang: 'ds'
})
*/

var rule = {
    类型: "影视",
    title: "追剧狂人",
    author: "不告诉你",
    logo: 'https://i-blog.csdnimg.cn/blog_migrate/2621e710a94ab40ba66645d47f296aaf.gif',
    host: "https://www.zjkrmv.vip",
    url: "/vodshow/fyfilter.html",
    searchUrl: "/vodsearch/**----------fypage---",
    searchable: 1, quickSearch: 1, double: true, timeout: 10000, play_parse: true, filterable: 1, invalid: true,
    class_name: "电影&连续剧&动漫&综艺&短剧",
    class_url: "1&2&4&3&23",
    filter_url: '{{fl.类型}}-{{fl.地区}}-{{fl.by}}-{{fl.剧情}}-----fypage---{{fl.年份}}.html',
    filter_def: {1: {类型: '1'}, 2: {类型: '2'}, 3: {类型: '3'}, 4: {类型: '4'}, 23: {类型: '23'}},
    推荐: async function (tid, pg, filter, extend) {
        const {input, pdfa, pdfh, pd} = this;
        const html = await request(input);
        const d = [];
        const data = pdfa(html, ".myui-vodbox-content");
        data.forEach((it) => {
            d.push({
                title: pdfh(it, ".title&&Text"),
                pic_url: pd(it, "img&&src"),
                desc: pdfh(it, ".tag&&Text"),
                url: pd(it, "a&&href"),
            });
        });
        return setResult(d);
    },
    一级: async function (tid, pg, filter, extend) {
        const {input, pdfa, pdfh, pd} = this;
        const html = await request(input);
        const d = [];
        const data = pdfa(html, ".show-vod-list&&a");
        data.forEach((it) => {
            d.push({
                title: pdfh(it, ".title&&Text"),
                pic_url: pd(it, "img&&src"),
                desc: pdfh(it, ".tag&&Text"),
                url: pd(it, "a&&href"),
            });
        });
        return setResult(d);
    },
    二级: async function (ids) {
        const {input, pdfa, pdfh, pd} = this;
        const html = await request(input);
        const playlist = pdfa(html, ".tab-pane");
        const tabs = pdfa(html, ".player-box&&ul li");
        let playmap = {};
        tabs.map((item, i) => {
            const form = pdfh(item, "Text");
            const list = playlist[i];
            const a = pdfa(list, "body&&a:not(:contains(排序))");
            a.map((it) => {
                let title = pdfh(it, "Text");
                let urls = pd(it, "a&&href", input);
                if (!playmap.hasOwnProperty(form)) {
                    playmap[form] = [];
                }
                playmap[form].push(title + "$" + urls);
            });
        });
        const urls = Object.values(playmap);
        const playUrls = urls.map((urllist) => urllist.join("#"));
        const VOD = {
            vod_name: pdfh(html, "h1&&Text"), // 名称
            vod_actor: pdfh(html, ".director:eq(1)&&Text"), // 演员
            vod_director: pdfh(html, ".director:eq(0)&&Text"), // 导演
            vod_remarks: pdfh(html, ".bottom:eq(1)&&Text"), // 备注
            vod_content: pdfh(html, ".wrapper_more_text&&Text"), // 简介p:eq(0)&&Text
            vod_play_from: Object.keys(playmap).join("$$$"), // 线路
            vod_play_url: playUrls.join("$$$"), // 播放地址
        };
        return VOD;
    },
    搜索: async function (wd, quick, pg) {
        const homeFn = rule.一级.bind(this);
        return await homeFn();
    },
    lazy: async function (flag, id, flags) {
        let {input, pdfa, pdfh, pd} = this;
        let html = await request(input);
        html = JSON.parse(html.match(/r player_.*?=(.*?)</)[1]);
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
    filter: "H4sIAAAAAAAAA+1aXW/TSBR951dUfu5D7X7CX1nxwK4qLdqFlRZ2JYSQgDRpk7JJWtFAaPqlbT4oDU2A7bYOSf5MZpz8CyZzJ547ae/ESBSBcJ96fMae4+vre8948vDalPpzXOfG1E8PQyyP/bb8QBx1gmaL7a470yZ599adZZr9+9bvfy3LSzp3h6NYsjZI1JxpwQyh6zyanhpRmVqvXQrSqyG7gNlCiaWrmF2UrDEdCJJq1po8kZTDL46Qpy85BqFnCqob7LyFZ7qOdPAnef64gFl3BstMV0fzjmjXppOvvez5aZtO16OEioAFzw2hLlbKyqtj9+FhpfzpcVDYMGir0sA/Yu0tm1JvXOnNEF647iinWKnBnvlUTl3OTsgpHILD6qCYChkFNT+oFPnZScgraAkCyzX4eYeMgKKpxOpk2XY7nE1B9ETeb2FeQc3315uYV9CWXC/KvHRMqlU0oXaw9xrPpiCKbed/zCuI76Zh3k1jglr2T4P5FTq2QBNq+UpOPF229lpPGB5BESx3g1w9SBd1EMMjNmWZfb7eFVejxYUjqHc1edprFXS0AEZ6Q84/9Fpt8g25lI3+hngz3jyqDwIY3Bzm5mwxEvwsXRmGJBEZwXl4Fs9U4GLONbkZzM3Y1YnSSKsTJKnOXUKzCGBwi5hbNLkFzC1MUDdvUzdvUYefkACRMkr2KDKjLmU/o+bKRq0zHSCqgrIz6yoI0FbFZMelqxjQdI8UpkKrATje7LUagOP9XJ8PcGJDp9UCTajt1yvs2ZEuTgCR2sxJ0Na8guOOAN/tENoqm/QIdFkDmqq59Uqvs68LLkCkJrU5KOqCrCA6f/dIhEOfD/CqMgH8jp4NIOITGf70leYBoti3cix5pmMP0KJ2sLPJX5ZJtYqm1BZW+2lfqwGIu+/b4Pl/rN1EDXh0BI3KHfb/RdkL0JYP2RTLvaPzAWgqe7t5kXE6ewHifCjxnQ2UDxIifqUbvClrHqDNkrY3glZpFAdCszHos/3pzw+oOsmzm8zPTaqTvNDonWUCvxve1v3b4nyUVok6r+gC9evt+/cMD9/un6yE7L1f/vhz2ajxN/X8jud8zaUb7tPC2fX8Ki777ix+tc5OhDM2aKuXEMZ0aDfTtN+iWyI/rg6NNZ5rIVpXvNqVSCopLoFyX8IobpuqLmrpQlUXoKmuqJYx5rIFBVEtHMyFQpSVDPVE1WKAqtxAU3WFXPeE75jw32znAJXL0ZHYgccO/MaP5sDJrm9aVNOSTnQy7MkpS4w3PB0lYxBVdyasDdjbU+bXNQ8wiv8lV+5g/8llu6Qptcocm2Y4ytrANFOmebL5GWUxKScDNKG2d36A3ZWC2N8meVF/61IQqd1KYTeuoN192Vq0or/495DvyZHNxo4sdmSxI4sd2SURjh1Z7MhiRzauOXZksSO7Skc291Ud2dxFR5ap8Y9vdH1aiuC61ClULSTrtDJ55oyzxm8AwJqNjXC/BXcmo6WzEWAUP0TFUt4q7XeA/uLvRuxUYqfyPTmVYRNa2TN6koCoFJP7pVRPStT7B4/pngQ0VcGytSCvf7+jIOLzu8Ex2tMDiNd41A4kobaf3+ln6d1bRVNq9w/YtvZKCiI1E/aieck39kMB2tSqDTdKLdCUWtJzKrUN8Wg/aLUATb783uAFtGXCYaf38RWdCUBTFTi7x9a2kXOTEHkt/x2r57XXAojydjvDi3o/VUGrT22y7guLT5X0D+2lPMvnrW/+PuS/jz4Bwn2c1vkqAAA="
}