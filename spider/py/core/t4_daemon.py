#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import hashlib
import importlib
import importlib.util
import json
import logging
import os
import pickle
import signal
import struct
import threading
import time
import traceback
from pathlib import Path
from socketserver import ThreadingMixIn, TCPServer, StreamRequestHandler
import sys

# =========================
# 配置常量
# =========================
HOST = "127.0.0.1"
PORT = 57570

MAX_MSG_SIZE = 10 * 1024 * 1024  # 10MB
INIT_TIMEOUT = 15  # 初始化超时（秒）
IDLE_EXPIRE = 30 * 60  # 实例空闲过期（秒）
CLEAN_INTERVAL = 5 * 60  # 清理间隔（秒）
REQUEST_TIMEOUT = 120  # 单次请求socket超时（秒）

LOG_LEVEL = os.environ.get("T4_LOG_LEVEL", "INFO").upper()
LOG_FILE = os.environ.get("T4_LOG_FILE")  # 若未设置则只打到控制台
PID_FILE = os.environ.get("T4_PID_FILE")  # 若设置则会写入PID

# =========================
# 日志
# =========================
logger = logging.getLogger("t4_daemon")
logger.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
fmt = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")

sh = logging.StreamHandler()
sh.setFormatter(fmt)
logger.addHandler(sh)

if LOG_FILE:
    fh = logging.FileHandler(LOG_FILE, encoding="utf-8")
    fh.setFormatter(fmt)
    logger.addHandler(fh)

if PID_FILE:
    try:
        Path(PID_FILE).write_text(str(os.getpid()), encoding="utf-8")
        logger.info("PID saved to %s", PID_FILE)
    except Exception as e:
        logger.warning("Save PID failed: %s", e)

# =========================
# 方法映射（保持兼容）
# =========================
METHOD_MAP = {
    'init': 'init',
    'home': 'homeContent',
    'homeVod': 'homeVideoContent',
    'category': 'categoryContent',
    'detail': 'detailContent',
    'search': 'searchContent',
    'play': 'playerContent',
    'proxy': 'localProxy',
    'action': 'action',
}


# =========================
# 工具：长度前缀协议
# =========================
def recv_exact(rfile, n: int) -> bytes:
    """从 rfile 精确读取 n 字节，若对端关闭或超限则抛异常。"""
    chunks = []
    remaining = n
    while remaining > 0:
        chunk = rfile.read(remaining)
        if not chunk:
            raise ConnectionError("peer closed during read")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def send_packet(wfile, obj: dict):
    payload = pickle.dumps(obj, protocol=pickle.HIGHEST_PROTOCOL)
    if len(payload) > MAX_MSG_SIZE:
        raise ValueError("payload too large")
    wfile.write(struct.pack(">I", len(payload)))
    wfile.write(payload)
    wfile.flush()


def recv_packet(rfile) -> dict:
    header = recv_exact(rfile, 4)
    (length,) = struct.unpack(">I", header)
    if length <= 0 or length > MAX_MSG_SIZE:
        raise ValueError("invalid length")
    payload = recv_exact(rfile, length)
    return pickle.loads(payload)


# =========================
# Spider 管理
# =========================
class SpiderInstance:
    def __init__(self, spider):
        self.spider = spider
        self.initialized = False
        self.initializing = False
        self.init_event = threading.Event()
        self.last_used = time.time()


class SpiderManager:
    def __init__(self, logger):
        self.logger = logger
        self._instances = {}
        self._lock = threading.Lock()
        self._running = True
        self._cleaner = threading.Thread(target=self._cleanup_loop, daemon=True)
        self._cleaner.start()

    def _cleanup_loop(self):
        while self._running:
            time.sleep(CLEAN_INTERVAL)
            now = time.time()
            with self._lock:
                keys = [
                    k for k, inst in self._instances.items()
                    if (now - inst.last_used) > IDLE_EXPIRE and not inst.initializing
                ]
                for k in keys:
                    self._instances.pop(k, None)
                    self.logger.info("Cleaned idle instance: %s", k[:16])

    def stop(self):
        self._running = False

    @staticmethod
    def _parse_env(env_str: str):
        """env 允许传 JSON 字符串，也允许传普通字符串（向后兼容）"""
        proxy_url = ""
        ext = ""
        if isinstance(env_str, str) and env_str.strip():
            try:
                data = json.loads(env_str)
                proxy_url = data.get("proxyUrl", "") or ""
                ext = data.get("ext", "") or ""
            except Exception:
                # 非JSON字符串时，保持兼容：当作 ext 传
                ext = env_str
        return proxy_url, ext

    def _instance_key(self, script_path: str, env_str: str) -> str:
        proxy_url, ext = self._parse_env(env_str)
        key_data = f"{Path(script_path).resolve()}|{proxy_url}|{ext}"
        return hashlib.sha256(key_data.encode("utf-8")).hexdigest()

    # ---------- 动态导入 ----------
    def _load_module_from_file(self, file_path: Path):
        name = file_path.stem
        logger.info("_load_module_from_file %s", name)
        # 加入项目根目录到 sys.path，保证 base.* 可以被导入
        project_root = file_path.parent  # 假设 py 是根目录
        if str(project_root) not in sys.path:
            sys.path.insert(0, str(project_root))
            logger.info("Added %s to sys.path", project_root)

        spec = importlib.util.spec_from_file_location(name, str(file_path))
        if spec is None or spec.loader is None:
            raise ImportError(f"Failed to load module from {file_path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def _import_spider_module(self, script_path: str):
        p = Path(script_path)
        if p.exists() and p.is_file() and p.suffix == ".py":
            return self._load_module_from_file(p)
        # 作为模块路径导入（已在 sys.path 中）
        return importlib.import_module(script_path)

    def _create_spider(self, script_path: str, env_str: str):
        try:
            module = self._import_spider_module(script_path)
            if not hasattr(module, "Spider"):
                raise AttributeError(f"{script_path} missing class 'Spider'")
            proxy_url, _ = self._parse_env(env_str)
            return module.Spider(t4_api=proxy_url)
        except Exception as e:
            self.logger.error("Create Spider failed: %s", e)
            raise

    def _spider_init(self, spider, ext: str):
        try:
            if hasattr(spider, "setExtendInfo"):
                spider.setExtendInfo(ext)
            depends = []
            if hasattr(spider, "getDependence"):
                depends = spider.getDependence() or []

            modules = []
            for lib in depends:
                try:
                    m = importlib.import_module(lib)
                    if hasattr(m, "Spider"):
                        modules.append(m.Spider(t4_api=ext))
                        self.logger.info("Loaded dependence: %s", lib)
                except Exception as e:
                    self.logger.warning("Dependence load failed %s: %s", lib, e)

            if hasattr(spider, "init"):
                return spider.init(modules)
            return {"status": "no init"}
        except Exception as e:
            self.logger.error("Spider init failed: %s", e)
            raise

    def _ensure_instance(self, script_path: str, env_str: str) -> SpiderInstance:
        key = self._instance_key(script_path, env_str)
        with self._lock:
            inst = self._instances.get(key)
            if inst:
                inst.last_used = time.time()
                return inst
            spider = self._create_spider(script_path, env_str)
            inst = SpiderInstance(spider)
            self._instances[key] = inst
            self.logger.info("New Spider instance: %s", key[:16])
            return inst

    def call(self, script_path: str, method_name: str, env_str: str, args_list):
        # 解析 env 中 ext
        _, ext = self._parse_env(env_str)
        inst = self._ensure_instance(script_path, env_str)

        # init 分支：同步初始化
        if method_name == "init":
            with threading.Lock():
                if inst.initializing:
                    inst.init_event.wait(INIT_TIMEOUT)
                if not inst.initialized:
                    inst.initializing = True
                    try:
                        init_ext = (args_list[0] if args_list else ext) or ""
                        ret = self._spider_init(inst.spider, init_ext)
                        inst.initialized = True
                        inst.init_event.set()
                        return ret
                    finally:
                        inst.initializing = False
                return {"status": "already initialized"}

        # 其他方法：若未初始化，则异步触发 + 等待
        if not inst.initialized:
            if not inst.initializing:
                def _bg():
                    try:
                        self._spider_init(inst.spider, ext)
                        inst.initialized = True
                        inst.init_event.set()
                    except Exception:
                        # 失败也置事件，避免永等
                        inst.init_event.set()

                inst.initializing = True
                threading.Thread(target=_bg, daemon=True).start()

            if not inst.init_event.wait(INIT_TIMEOUT) or not inst.initialized:
                return {"success": False, "error": "init timeout or failed"}

        # 解析 args
        parsed_args = []
        for a in (args_list or []):
            if isinstance(a, (dict, list, int, float, bool, type(None))):
                parsed_args.append(a)
            elif isinstance(a, str):
                try:
                    parsed_args.append(json.loads(a))
                except Exception:
                    parsed_args.append(a)
            else:
                parsed_args.append(a)

        # 方法映射
        invoke = METHOD_MAP.get(method_name, method_name)
        if not hasattr(inst.spider, invoke):
            return {"success": False, "error": f"Spider missing method '{invoke}'"}

        try:
            result = getattr(inst.spider, invoke)(*parsed_args)
            # 若 Spider 提供 json2str 则尝试序列化
            if result is not None and hasattr(inst.spider, "json2str"):
                try:
                    return inst.spider.json2str(result)
                except Exception:
                    return result
            return result
        except Exception as e:
            self.logger.error("Call '%s' failed: %s", invoke, e)
            return {
                "success": False,
                "error": str(e),
                "traceback": traceback.format_exc(),
            }


# =========================
# Server
# =========================
_manager = SpiderManager(logger)


class T4Handler(StreamRequestHandler):
    def handle(self):
        self.request.settimeout(REQUEST_TIMEOUT)
        try:
            req = recv_packet(self.rfile)
            script_path = req.get("script_path", "")
            method_name = req.get("method_name", "")
            env = req.get("env", "") or ""
            args = req.get("args", []) or []

            result = _manager.call(script_path, method_name, env, args)
            resp = {
                "success": not (isinstance(result, dict) and result.get("success") is False and "error" in result),
                "result": result if not (isinstance(result, dict) and result.get("success") is False) else None,
            }
            if isinstance(result, dict) and result.get("success") is False:
                resp["error"] = result.get("error")
                if result.get("traceback"):
                    resp["traceback"] = result["traceback"]

            send_packet(self.wfile, resp)
        except Exception as e:
            logger.error("Handle error: %s", e)
            try:
                send_packet(self.wfile, {"success": False, "error": str(e)})
            except Exception:
                pass  # 对端已断开


class ThreadedTCPServer(ThreadingMixIn, TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def run():
    def _stop(*_):
        logger.info("Stopping server ...")
        _manager.stop()
        # 让 serve_forever() 退出
        srv.shutdown()

    if os.name == "posix":
        signal.signal(signal.SIGTERM, _stop)
        signal.signal(signal.SIGINT, _stop)

    global srv
    srv = ThreadedTCPServer((HOST, PORT), T4Handler)
    logger.info("T4 daemon listening on %s:%d", HOST, PORT)
    try:
        srv.serve_forever(poll_interval=0.5)
    finally:
        srv.server_close()
        logger.info("Server closed.")


if __name__ == "__main__":
    run()
