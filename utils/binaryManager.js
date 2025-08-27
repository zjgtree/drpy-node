import path from "path";

/**
 * 调用本地 Go /proxy 接口
 * @param {Object} options
 * @param {string} options.method - HTTP 方法 GET/POST/PUT/DELETE
 * @param {string} options.url - 目标 URL
 * @param {Object} [options.headers] - 请求头
 * @param {Object} [options.body] - 请求 JSON body
 * @param {number} [options.timeout] - 毫秒级超时
 * @param {string} [options.goHost] - Go 服务 host 默认 http://127.0.0.1:57571
 * @returns {Promise<Object>} { status, headers, body }
 */
export async function goProxy({
                                  method = "GET",
                                  url,
                                  headers = {},
                                  body,
                                  timeout,
                                  goHost = "http://127.0.0.1:57571",
                              }) {
    if (!url) throw new Error("url is required");

    const proxyUrl = new URL("/proxy", goHost);

    const controller = new AbortController();
    if (timeout) {
        setTimeout(() => controller.abort(), timeout);
    }

    const resp = await fetch(proxyUrl.toString(), {
        method: "POST", // 统一用 POST 调用 Go /proxy
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({method, url, headers, body, timeout}),
        signal: controller.signal,
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Go proxy request failed: ${resp.status} ${text}`);
    }

    const data = await resp.json();
    return data;
}

export function getGoBinary(rootDir) {
    const platform = process.platform;
    const go_bin = './binary/go_proxy/'
    if (platform === "win32") return path.join(rootDir, go_bin, './server-windows.exe');
    if (platform === "linux") return path.join(rootDir, go_bin, './server-linux');
    if (platform === "android") return path.join(rootDir, go_bin, './server-android'); // 安卓设备
    console.log("[getGoBinary] Unsupported platform: " + platform);
    return null;
    // throw new Error("Unsupported platform: " + platform);
}