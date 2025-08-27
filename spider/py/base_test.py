import json
import time

from core.t4_daemon import _manager
from base.spider import BaseSpider
from cachetools import cached, TTLCache


# 计算斐波那契数列

def get_cache_key(n):
    return n


# 不加缓存的递归实现
def fibonacci_no_cache(n):
    if n < 2:
        return n
    return fibonacci_no_cache(n - 1) + fibonacci_no_cache(n - 2)


# 加缓存的递归实现
@cached(cache=TTLCache(maxsize=100, ttl=3600), key=get_cache_key)
def fibonacci_with_cache(n):
    if n < 2:
        return n
    return fibonacci_with_cache(n - 1) + fibonacci_with_cache(n - 2)


def encrypt_demo():
    input_str = '这是需要gzip加密的字符串'
    output_str = BaseSpider.gzip(input_str)
    print('gzip加密后的字符串:', output_str)
    input_str = BaseSpider.ungzip(output_str)
    print('gzip解密后的字符串:', input_str)


def speed_demo():
    # 示例：找到斐波那契数列前n项之和小于等于100的最大n值
    n = 36
    t1 = time.time()
    result1 = fibonacci_no_cache(n)
    t2 = time.time()
    cost = round((t2 - t1) * 1000, 8)
    print(f'不带缓存计算fib({n})= 耗时{cost:.6f}毫秒,结果为:{result1}')
    t3 = time.time()
    result2 = fibonacci_with_cache(n)
    t4 = time.time()
    cost = round((t4 - t3) * 1000, 8)
    print(f'带缓存计算fib({n})= 耗时{cost:.6f}毫秒,结果为:{result2}')


def main():
    script_path = './七猫小说[书].py'
    env = {
        'proxyUrl': '',
        'ext': '',
    }
    home_result = _manager.call(script_path, 'home', env, [1])
    home_result = json.loads(home_result)
    print('首页数据:', home_result)
    homeVod_result = _manager.call(script_path, 'homeVod', env, [])
    print('推荐数据:', homeVod_result)
    type_name = home_result['class'][0]['type_name']
    type_id = home_result['class'][0]['type_id']
    print(f'第一个分类名称: {type_name}, 分类ID:{type_id}')
    category_result = _manager.call(script_path, 'category', env, [type_id, 1, 1, {}])
    category_result = json.loads(category_result)
    print(f'第一个分类数据:', category_result)
    vod_id = category_result['list'][0]['vod_id']
    detail_result = _manager.call(script_path, 'detail', env, [[vod_id]])
    detail_result = json.loads(detail_result)
    print(f'{vod_id} 对应的详情数据:', detail_result)
    vod_play_url = detail_result['list'][0]['vod_play_url']
    vod_play_from = detail_result['list'][0]['vod_play_from']
    play = vod_play_url.split('#')[0].split('$')[1]
    print(f'解析播放数据: vod_play_from= {vod_play_from},play= {play}')
    play_result = _manager.call(script_path, 'play', env, [vod_play_from, play, []])
    print(f'播放数据:', play_result)
    key = '剑来'
    search_result = _manager.call(script_path, 'search', env, [key, 0, 1])
    search_result = json.loads(search_result)
    print(f'搜索{key}结果:', search_result)


if __name__ == '__main__':
    encrypt_demo()
    speed_demo()
    # main()
