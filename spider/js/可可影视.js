/*
@header({
  searchable: 0,
  filterable: 0,
  quickSearch: 0,
  title: '可可影视',
  '类型': '影视',
  lang: 'ds'
})
*/

var rule = {
    类型: '影视',
    title: '可可影视',
    host: 'https://www.keke1.app/',
    url: '/show/fyclass-----1-fypage.html',
    filter_url: '',
    searchUrl: '/search?k=**穹&page=fypage',
    searchable: 0,
    quickSearch: 0,
    filterable: 0,
    filter: '',
    headers: {
        'User-Agent': PC_UA,
    },
    timeout: 5000,
    class_name: '电影&连续剧&动漫&综艺&短剧',
    class_url: '1&2&3&4&6',
    play_parse: true,
    class_parse: async () => {
    },
    预处理: async () => {
    },
    图片替换: async function (input) {
        let {HOST} = this;
        // console.log('HOST:', HOST);
        return input.replace(HOST, "https://vres.cfaqcgj.com");
    },
    推荐: async () => {
        return []
    },
    一级: '.module-v-box&&.module-item;.v-item-title:eq(1)&&Text;.lazyload:eq(-1)&&data-original;.v-item-bottom&&Text;a&&href',
    二级: async function (ids) {
        let {input} = this;
        let vod = {};
        return vod
    },
    搜索: '',
    lazy: '',
};