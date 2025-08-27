/*
@header({
  searchable: 2,
  filterable: 0,
  quickSearch: 0,
  title: '樱花动漫',
  lang: 'dr2'
})
*/

var rule = {
    title: '樱花动漫',
    模板:'mxpro',
    host: 'http://www.yinghuadm.cn',
    url: '/show_fyclass--------fypage---.html',
    searchUrl: '/search_**----------fypage---.html',
    class_parse: '.navbar-items li:gt(0):lt(6);a&&Text;a&&href;_(.*?)\.html',
    tab_exclude: '排序',
    searchable: 2,
    quickSearch: 0,
    filterable: 0,
}