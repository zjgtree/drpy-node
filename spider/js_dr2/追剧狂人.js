/*
@header({
searchable: 1,
filterable: 1,
quickSearch: 1,
title: '追剧狂人',
logo: 'https://i-blog.csdnimg.cn/blog_migrate/2621e710a94ab40ba66645d47f296aaf.gif',
lang: 'dr2'
})
 */

var rule = {
    类型: '影视',
    title: '追剧狂人',
    author: '不告诉你',
    host: 'https://www.zjkrmv.vip',
    logo: 'https://i-blog.csdnimg.cn/blog_migrate/2621e710a94ab40ba66645d47f296aaf.gif',
    url: '/vodshow/fyclass--------fypage---.html',
    searchUrl: '/vodsearch/**----------fypage---.html',
    headers: {
        'User-Agent': 'MOBILE_UA'
    },
    searchable: 1,
    quickSearch: 1,
    double: true,
    timeout: 10000,
    play_parse: true,
    filterable: 0,
    invalid: true,
    class_name: '电影&电视剧&动漫&短剧&综艺',
    class_url: '1&2&4&23&3',
    推荐: '*',
    一级: 'body&&.myui-vodbox-content;img&&alt;img&&src;.tag-box&&Text;a&&href',
    二级: {
        title: 'h1&&Text',
        img: 'img&&src',
        desc: '.tags&&Text;;;.detail-box&&.director:eq(1)&&Text;.detail-box&&.director:eq(0)&&Text',
        content: '.vod-content&&.wrapper_more_text&&Text',
        tabs: '.nav-btn li',
        lists: '.tab-content&&.tab-pane:eq(#id) a',
    },
    lazy: "js:\n  let html = request(input);\n  let hconf = html.match(/r player_.*?=(.*?)</)[1];\n  let json = JSON5.parse(hconf);\n  let url = json.url;\n  if (json.encrypt == '1') {\n    url = unescape(url);\n  } else if (json.encrypt == '2') {\n    url = unescape(base64Decode(url));\n  }\n  if (/\\.(m3u8|mp4|m4a|mp3)/.test(url)) {\n    input = {\n      parse: 0,\n      jx: 0,\n      url: url,\n    };\n  } else {\n    input;\n  }",
    搜索: '*',
}
