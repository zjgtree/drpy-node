import _axios from 'axios';
import https from 'https';
import http from 'http';

const req = _axios.create({
    httpsAgent: new https.Agent({keepAlive: true, rejectUnauthorized: false}),
    httpAgent: new http.Agent({keepAlive: true}),
});

export const reqs = new _axios.create({
    httpsAgent: new https.Agent({
        rejectUnauthorized: false
    })
});

export default req;
