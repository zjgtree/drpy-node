import os
import json
import requests
from urllib.parse import urlparse
import sys

# 检查是否安装了json5库
try:
    import json5
except ImportError:
    print("错误：需要安装json5库来处理带注释的JSON文件")
    print("请运行: pip install json5")
    sys.exit(1)

def extract_origin(url):
    """从完整URL中提取origin部分（协议+域名+端口）"""
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"

def check_url_availability(url, timeout=5):
    """检查URL是否可用（5秒内返回HTML内容）"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)

        # 检查状态码和内容类型
        if response.status_code == 200:
            content_type = response.headers.get('Content-Type', '').lower()
            if 'text/html' in content_type:
                return True
        return False
    except (requests.exceptions.RequestException, ValueError):
        return False

def process_json_files(directory):
    """处理目录中的所有JSON文件并生成结果"""
    results = []

    for filename in os.listdir(directory):
        if filename.endswith('.json'):
            file_path = os.path.join(directory, filename)
            entry = {
                "name": filename,
                "url": None,
                "avaliable": False
            }

            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    # 使用json5加载带注释的JSON
                    data = json5.load(f)

                # 尝试获取两种链接
                target_url = data.get('首页推荐链接') or data.get('分类链接')

                if target_url:
                    # 提取origin
                    origin_url = extract_origin(target_url)
                    entry["url"] = origin_url

                    # 检查URL可用性
                    entry["avaliable"] = check_url_availability(origin_url)

            except (json5.JSONDecodeError, TypeError, ValueError) as e:
                print(f"解析错误: {filename} - {str(e)}")
                # 保持默认的不可用状态
            except Exception as e:
                print(f"处理文件 {filename} 时出错: {str(e)}")

            results.append(entry)

    # 保存结果到JSON文件
    output_file = 'XYQ提取结果.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    return results, output_file

if __name__ == "__main__":
    target_dir = input("请输入包含JSON文件的目录路径: ").strip()

    if not os.path.isdir(target_dir):
        print("错误：指定的路径不是目录或不存在")
        exit(1)

    print(f"开始处理目录: {target_dir}")
    results, output_file = process_json_files(target_dir)

    print(f"\n处理完成！结果已保存到 '{output_file}'")
    print(f"共处理 {len(results)} 个文件，结果摘要:")

    # 统计结果
    valid_count = sum(1 for entry in results if entry['url'])
    available_count = sum(1 for entry in results if entry['avaliable'])

    for entry in results:
        status = "可用" if entry['avaliable'] else "不可用"
        url_display = entry['url'] if entry['url'] else "未找到有效链接"
        print(f"- {entry['name']}: {url_display} ({status})")

    print(f"\n统计: {valid_count} 个文件包含有效链接, {available_count} 个链接可用")