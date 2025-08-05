/*!
 * - 网络请求库
 *   - sync-fetch可以在渲染进程-worker线程运行
 *   - sync-request可以在主进程-fork线程运行
*/
import syncFetch from 'sync-fetch';
import { Buffer } from 'buffer';
import FormData from 'form-data';
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36';
const PC_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.54 Safari/537.36';
const UA = 'Mozilla/5.0';
const UC_UA =
  'Mozilla/5.0 (Linux; U; Android 9; zh-CN; MI 9 Build/PKQ1.181121.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/57.0.2987.108 UCBrowser/12.5.5.1035 Mobile Safari/537.36';
const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1';

const getTimeout = (timeout) => {
  const baseTimeout = 8000;
  if (timeout != null) return Math.max(baseTimeout, timeout);
  if (globalThis.variable && globalThis.variable.timeout)
    return Math.max(baseTimeout, globalThis.variable.timeout);
  return baseTimeout;
};

const toTitleCase = (str) =>
  str.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('-');

const parseQueryString = (query) => {
  const params = {};
  query.split('&').forEach((part) => {
    const match = part.match(/^(.*?)=(.*)/);
    if (match) params[decodeURIComponent(match[1])] = decodeURIComponent(match[2]);
  });
  return params;
};

// fetch 必须为同步函数
const evalFetch = (url, options = {}) => {
  try {
    let method = (options.method || 'GET').toUpperCase();
    url = new URL(url).href;

    const headers = options.headers || {};
    const headersInTitleCase = Object.keys(headers).reduce((obj, key) => {
      obj[toTitleCase(key)] = headers[key];
      return obj;
    }, {});

    const config = {
      method,
      headers: headersInTitleCase,
      timeout: getTimeout(options.timeout),
      redirect: options.redirect === false ? 'manual' : 'follow',
    };

    if (!config.headers['User-Agent']) config.headers['User-Agent'] = MOBILE_UA;
    if (!config.headers['Referer']) config.headers['Referer'] =(url.startsWith('http'))?new URL(url).origin:url;
    if (/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(config.headers['Referer'])) {
      config.headers['Referer'] = new URL(config.headers['Referer']).href;
    }

    const contentType = config.headers['Content-Type'] || '';
    let charset = 'utf-8';
    if (contentType.includes('charset=')) {
      const matchRes = contentType.match(/charset=([\w-]+)/);
      if (matchRes) charset = matchRes[1];
    }

    if (method !== 'GET') {
      if (options.body && typeof options.body === 'string') options.body = parseQueryString(options.body);
      if (contentType.includes('application/x-www-form-urlencoded')) {
        config.body = new URLSearchParams(options.body).toString();
      } else if (contentType.includes('multipart/form-data')) {
        if (!fs) throw new Error('fs module required for multipart/form-data');
        const fd = new FormData();
        fd.append('file', fs.readFileSync(options.body), options.body);
        config.body = fd;
        config.headers['Content-Type'] = fd.getHeaders();
      } else {
        if (!config.headers['content-type']) config.headers['Content-Type'] = 'application/json';
        config.body = JSON.stringify(options.body);
      }
    }

    console.warn(`[request] url: ${url} | method: ${method} | options: ${JSON.stringify(config)}`);

    let res = syncFetch(url, config);
    res.getBody = function (encoding) {
      return encoding ? Buffer.from(res.buffer()).toString(encoding) : res.buffer();
    };

    if (options.onlyHeaders) return res.headers.raw();
    if (options.withHeaders)
      return JSON.stringify({ headers: res.headers.raw(), body: res.getBody(charset) });
    if (options.withStatusCode)
      return JSON.stringify({ headers: res.headers.raw(), body: res.getBody(charset), statusCode: res.status });
    if (options.toHex)
      return JSON.stringify({
        headers: res.headers.raw(),
        body: Buffer.from(res.getBody()).toString('hex'),
        statusCode: res.status,
      });
    return res.getBody(charset);
  } catch (err) {
    console.log(err);
    return null;
  }
};
function getOriginalJs(js_code) {
  let current_match =
    /var rule|[\u4E00-\u9FA5]+|function|let |var |const |\(|\)|"|'/;
  if (current_match.test(js_code)) {
    return js_code;
  }
  let rsa_private_key =
    "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCqin/jUpqM6+fgYP/oMqj9zcdHMM0mEZXLeTyixIJWP53lzJV2N2E3OP6BBpUmq2O1a9aLnTIbADBaTulTNiOnVGoNG58umBnupnbmmF8iARbDp2mTzdMMeEgLdrfXS6Y3VvazKYALP8EhEQykQVarexR78vRq7ltY3quXx7cgI0ROfZz5Sw3UOLQJ+VoWmwIxu9AMEZLVzFDQN93hzuzs3tNyHK6xspBGB7zGbwCg+TKi0JeqPDrXxYUpAz1cQ/MO+Da0WgvkXnvrry8NQROHejdLVOAslgr6vYthH9bKbsGyNY3H+P12kcxo9RAcVveONnZbcMyxjtF5dWblaernAgMBAAECggEAGdEHlSEPFmAr5PKqKrtoi6tYDHXdyHKHC5tZy4YV+Pp+a6gxxAiUJejx1hRqBcWSPYeKne35BM9dgn5JofgjI5SKzVsuGL6bxl3ayAOu+xXRHWM9f0t8NHoM5fdd0zC3g88dX3fb01geY2QSVtcxSJpEOpNH3twgZe6naT2pgiq1S4okpkpldJPo5GYWGKMCHSLnKGyhwS76gF8bTPLoay9Jxk70uv6BDUMlA4ICENjmsYtd3oirWwLwYMEJbSFMlyJvB7hjOjR/4RpT4FPnlSsIpuRtkCYXD4jdhxGlvpXREw97UF2wwnEUnfgiZJ2FT/MWmvGGoaV/CfboLsLZuQKBgQDTNZdJrs8dbijynHZuuRwvXvwC03GDpEJO6c1tbZ1s9wjRyOZjBbQFRjDgFeWs9/T1aNBLUrgsQL9c9nzgUziXjr1Nmu52I0Mwxi13Km/q3mT+aQfdgNdu6ojsI5apQQHnN/9yMhF6sNHg63YOpH+b+1bGRCtr1XubuLlumKKscwKBgQDOtQ2lQjMtwsqJmyiyRLiUOChtvQ5XI7B2mhKCGi8kZ+WEAbNQcmThPesVzW+puER6D4Ar4hgsh9gCeuTaOzbRfZ+RLn3Aksu2WJEzfs6UrGvm6DU1INn0z/tPYRAwPX7sxoZZGxqML/z+/yQdf2DREoPdClcDa2Lmf1KpHdB+vQKBgBXFCVHz7a8n4pqXG/HvrIMJdEpKRwH9lUQS/zSPPtGzaLpOzchZFyQQBwuh1imM6Te+VPHeldMh3VeUpGxux39/m+160adlnRBS7O7CdgSsZZZ/dusS06HAFNraFDZf1/VgJTk9BeYygX+AZYu+0tReBKSs9BjKSVJUqPBIVUQXAoGBAJcZ7J6oVMcXxHxwqoAeEhtvLcaCU9BJK36XQ/5M67ceJ72mjJC6/plUbNukMAMNyyi62gO6I9exearecRpB/OGIhjNXm99Ar59dAM9228X8gGfryLFMkWcO/fNZzb6lxXmJ6b2LPY3KqpMwqRLTAU/zy+ax30eFoWdDHYa4X6e1AoGAfa8asVGOJ8GL9dlWufEeFkDEDKO9ww5GdnpN+wqLwePWqeJhWCHad7bge6SnlylJp5aZXl1+YaBTtOskC4Whq9TP2J+dNIgxsaF5EFZQJr8Xv+lY9lu0CruYOh9nTNF9x3nubxJgaSid/7yRPfAGnsJRiknB5bsrCvgsFQFjJVs=";
  let decode_content = "";
  function aes_decrypt(data) {
    let key = CryptoJS.enc.Hex.parse("686A64686E780A0A0A0A0A0A0A0A0A0A");
    let iv = CryptoJS.enc.Hex.parse("647A797964730A0A0A0A0A0A0A0A0A0A");
    let encrypted = CryptoJS.AES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(data) },
      key,
      { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
    ).toString(CryptoJS.enc.Utf8);
    return encrypted;
  }
  let error_log = false;
  function logger(text) {
    if (error_log) {
      log(text);
    }
  }
  let decode_funcs = [
    (text) => {
      try {
        return ungzip(text);
      } catch (e) {
        logger("非gzip加密");
        return "";
      }
    },
    (text) => {
      try {
        return base64Decode(text);
      } catch (e) {
        logger("非b64加密");
        return "";
      }
    },
    (text) => {
      try {
        return aes_decrypt(text);
      } catch (e) {
        logger("非aes加密");
        return "";
      }
    },
    (text) => {
      try {
        return RSA.decode(text, rsa_private_key, null);
      } catch (e) {
        logger("非rsa加密");
        return "";
      }
    },
  ];
  let func_index = 0;
  while (!current_match.test(decode_content)) {
    decode_content = decode_funcs[func_index](js_code);
    func_index++;
    if (func_index >= decode_funcs.length) {
      break;
    }
  }
  return decode_content;
}


const hasPropertyIgnoreCase = (obj, propertyName) =>
  Object.keys(obj).some((key) => key.toLowerCase() === propertyName.toLowerCase());

const valueStartsWith = (obj, propertyName, prefix) => {
  const key = Object.keys(obj).find((key) => key.toLowerCase() === propertyName.toLowerCase());
  return key !== undefined && obj[key].startsWith(prefix);
};


const req = (url, cobj) => {
  try {
    let res = {};
    let obj = Object.assign({}, cobj);
    if (obj.data) {
      obj.body = obj.data;
      if (
        (obj.postType && obj.postType == 'form') ||
        (hasPropertyIgnoreCase(obj.headers, 'Content-Type') &&
          valueStartsWith(obj.headers, 'Content-Type', 'application/x-www-form-urlencoded'))
      ) {
        let temp_obj = obj.data;
        obj.body = Object.keys(temp_obj)
          .map((key) => `${key}=${temp_obj[key]}`)
          .join('&');
      }
      delete obj.data;
    }
    if (obj.hasOwnProperty('redirect')) obj.redirect = !!obj.redirect;
    if (obj.buffer === 2) obj.toHex = true;
    obj.headers = Object.assign(obj.headers);
    if (url === 'https://api.nn.ci/ocr/b64/text' && obj.headers) {
      obj.headers['Content-Type'] = 'text/plain';
    }
    let isFile = url.startsWith('file://');
    if (isFile && (url.includes('?type=') || url.includes('?params='))) {
      url = url.slice(0, url.lastIndexOf('?'));
    }
    for (let key in obj.headers) {
      if (typeof obj.headers[key] !== 'string') obj.headers[key] = String(obj.headers[key]);
    }
    let r = '';
    if (!isFile) {
      r = fetch(url, obj);
    }
    if (obj.withHeaders) {
      r = JSON.parse(r);
      res['content'] = r['body'];
      res['headers'] = {};
      for (const [k, v] of Object.entries(r['headers'] || {})) {
        res['headers'][k] = v && v[0];
      }
    } else {
      res['content'] = r;
    }
    if (obj.buffer === 2) {
      res['content'] = Buffer.from(r['body'], 'hex').toString('base64');
    }
    return res;
  } catch (err) {
    console.log('Error' + err.toString());
  }
};
function request(url, obj, ocr_flag) {
  ocr_flag = ocr_flag || false;
  if (typeof obj === "undefined" || !obj || Object.keys(obj).length === 0) {
    if (!fetch_params || !fetch_params.headers) {
      let headers = { "User-Agent": MOBILE_UA };
      if (rule.headers) {
        Object.assign(headers, rule.headers);
      }
      if (!fetch_params) {
        fetch_params = {};
      }
      fetch_params.headers = headers;
    }
    if (!fetch_params.headers.Referer) {
      fetch_params.headers.Referer = getHome(url);
    }
    obj = fetch_params;
  } else {
    let headers = obj.headers || {};
    let keys = Object.keys(headers).map((it) => it.toLowerCase());
    if (!keys.includes("user-agent")) {
      headers["User-Agent"] = MOBILE_UA;
      if (
        typeof fetch_params === "object" &&
        fetch_params &&
        fetch_params.headers
      ) {
        let fetch_headers = keysToLowerCase(fetch_params.headers);
        if (fetch_headers["user-agent"]) {
          headers["User-Agent"] = fetch_headers["user-agent"];
        }
      }
    }
    if (!keys.includes("referer")) {
      headers["Referer"] = getHome(url);
    }
    obj.headers = headers;
  }
  if (rule.encoding && rule.encoding !== "utf-8" && !ocr_flag) {
    if (
      !obj.headers.hasOwnProperty("Content-Type") &&
      !obj.headers.hasOwnProperty("content-type")
    ) {
      obj.headers["Content-Type"] = "text/html; charset=" + rule.encoding;
    }
  }
  if (
    typeof obj.body != "undefined" &&
    obj.body &&
    typeof obj.body === "string"
  ) {
    if (
      !obj.headers.hasOwnProperty("Content-Type") &&
      !obj.headers.hasOwnProperty("content-type")
    ) {
      obj.headers["Content-Type"] =
        "application/x-www-form-urlencoded; charset=" + rule.encoding;
    }
  } else if (
    typeof obj.body != "undefined" &&
    obj.body &&
    typeof obj.body === "object"
  ) {
    obj.data = obj.body;
    delete obj.body;
  }
  if (!url) {
    return obj.withHeaders ? "{}" : "";
  }
  if (obj.toBase64) {
    obj.buffer = 2;
    delete obj.toBase64;
  }
  if (obj.redirect === false) {
    obj.redirect = 0;
  }
  if (
    obj.headers.hasOwnProperty("Content-Type") ||
    obj.headers.hasOwnProperty("content-type")
  ) {
    let _contentType =
      obj.headers["Content-Type"] || obj.headers["content-type"] || "";
    if (_contentType.includes("application/x-www-form-urlencoded")) {
      log("custom body is application/x-www-form-urlencoded");
      if (typeof obj.body == "string") {
        let temp_obj = parseQueryString(obj.body);
        console.log(JSON.stringify(temp_obj));
      }
    }
  }
  console.log(JSON.stringify(obj.headers));
  console.log(
    "request:" + url + `|method:${obj.method || "GET"}|body:${obj.body || ""}`
  );
  let res = req(url, obj);
  let html = res.content || "";
  if (obj.withHeaders) {
    let htmlWithHeaders = res.headers;
    htmlWithHeaders.body = html;
    return JSON.stringify(htmlWithHeaders);
  } else {
    return html;
  }
}
// ESM导出
export { evalFetch,getOriginalJs,req,request };
