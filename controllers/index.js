import staticController from './static.js';
import docsController from './docs.js';
import configController from './config.js';
import apiController from './api.js';
import mediaProxyController from './mediaProxy.js';
import rootController from './root.js';
import encoderController from './encoder.js';
import decoderController from './decoder.js';
import authCoderController from './authcoder.js';
import webController from './web.js';
import httpController from './http.js';
// import taskController from './tasker.js';
import cronTaskerController from './cron-tasker.js';

export const registerRoutes = (fastify, options) => {
    fastify.register(staticController, options);
    fastify.register(docsController, options);
    fastify.register(configController, options);
    fastify.register(apiController, options);
    fastify.register(mediaProxyController, options);
    fastify.register(rootController, options);
    fastify.register(encoderController, options);
    fastify.register(decoderController, options);
    fastify.register(authCoderController, options);
    fastify.register(webController, options);
    fastify.register(httpController, options);
    // fastify.register(taskController, options);
    fastify.register(cronTaskerController, options);
};
