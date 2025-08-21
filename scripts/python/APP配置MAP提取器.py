import json
import os


def process_json_to_txt(json_file_path, output_txt_path):
    # 读取JSON文件
    with open(json_file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    results = []
    splitStr = '@@'

    for item in data:
        # 从api字段提取文件名（不含.py后缀）
        api_path = item.get('api', '')
        filename = os.path.splitext(os.path.basename(api_path))[0]

        # 获取name字段
        name = item.get('name', '')

        # 处理exts字段
        exts = item.get('exts', {})
        for key, value in exts.items():
            if isinstance(value, dict):
                value = json.dumps(value, ensure_ascii=False)
            line = f"{filename}{splitStr}{value}{splitStr}{key}[{name}]"
            results.append(line)

    # 写入TXT文件
    with open(output_txt_path, 'w+', encoding='utf-8') as f:
        f.write('\n'.join(results).strip())

    print(f"处理完成，共生成 {len(results)} 行数据")


# 使用示例
if __name__ == "__main__":
    input_json = "App_PY.json"  # 输入的JSON文件路径
    output_txt = "appMap.txt"  # 输出的TXT文件路径

    process_json_to_txt(input_json, output_txt)
