const plugins = [
    {
        name: 'req-proxy',
        path: 'plugins/req-proxy',
        params: '-p 57571',
        desc: 'req代理服务',
        active: true
    },
    {
        name: 'pvideo',
        path: 'plugins/pvideo',
        params: '-port 57572 -dns 8.8.8.8',
        desc: '嗷呜适配代理服务',
        active: true
    },
]

export default plugins;