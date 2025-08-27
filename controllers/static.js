import fastifyStatic from '@fastify/static';

export default (fastify, options, done) => {
    // 静态资源
    fastify.register(fastifyStatic, {
        root: options.publicDir,
        prefix: '/public/',
    });

    fastify.register(fastifyStatic, {
        root: options.appsDir,
        prefix: '/apps/', // 新的访问路径前缀
        decorateReply: false, // 禁用 sendFile
    });

    fastify.register(fastifyStatic, {
        root: options.jsonDir,
        prefix: '/json/', // 新的访问路径前缀
        decorateReply: false, // 禁用 sendFile
    });

    fastify.register(fastifyStatic, {
        root: options.dr2Dir,
        prefix: '/js/', // 新的访问路径前缀
        decorateReply: false, // 禁用 sendFile
        // setHeaders: (res, path) => {
        //     res.setHeader('Cache-Control', 'no-store'); // 禁用缓存确保每次获取最新
        // }
    });

    fastify.register(fastifyStatic, {
        root: options.pyDir,
        prefix: '/py/', // 新的访问路径前缀
        decorateReply: false, // 禁用 sendFile
        setHeaders: (res, path) => {
            // 自定义 .py 文件的 Content-Type
            if (path.endsWith('.py')) {
                res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            }
        }
    });

    fastify.register(fastifyStatic, {
        root: options.catDir,
        prefix: '/cat/', // 新的访问路径前缀
        decorateReply: false, // 禁用 sendFile
    });

    fastify.register(fastifyStatic, {
        root: options.catLibDir,
        prefix: '/catLib/', // 新的访问路径前缀
        decorateReply: false, // 禁用 sendFile
    });

    fastify.register(fastifyStatic, {
        root: options.xbpqDir,
        prefix: '/xbpq/', // 新的访问路径前缀
        decorateReply: false, // 禁用 sendFile
    });

    done();
}