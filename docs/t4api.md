# T4服务接口对接文档

## 概述

本文档描述了基于 `/api/:module` 路径的接口服务。该服务根据不同的参数组合调用不同的功能模块，包括播放、分类、详情、动作、搜索、刷新和默认首页数据。所有接口均支持GET和POST请求方式。

## 通用说明

- **请求方式**：GET 或 POST
- **基础路径**：`/api/:module`，其中 `:module` 为模块名称（如 `vod1`）
- **参数传递**：
    - GET请求：参数通过URL的query string传递
    - POST请求：参数可通过`application/x-www-form-urlencoded`或`application/json`格式传递
- **安全验证**：所有接口请求都会经过`validatePwd`中间件验证（具体验证逻辑由实现方决定）
- **错误响应**：
  ```json
  {
    "error": "错误信息"
  }
  ```
- **通用传参**： 若这个接口需要extend传参，确保每个地方调用都在各自的请求参数基础上加上原本的extend传参

## 接口列表

### 1. 播放接口

**功能说明**：根据播放ID和源标识获取视频播放地址及信息。

#### 请求参数

| 参数名  | 必填 | 类型     | 说明                       |
|------|----|--------|--------------------------|
| play | 是  | string | 播放ID                     |
| flag | 否  | string | 源标识，详情接口返回播放信息里有，播放时建议加上 |

#### 请求示例

```http
GET /api/vod1?play=123&flag=youku
```

或

```http
POST /api/vod1
Content-Type: application/x-www-form-urlencoded
play=123&flag=youku
```

#### 响应示例

```json
{
  "url": "https://example.com/video.mp4",
  "type": "hls",
  "headers": {
    "Referer": "https://example.com"
  }
}
```

### 2. 分类接口

**功能说明**：获取指定分类下的视频列表，支持分页和筛选条件。

#### 请求参数

| 参数名 | 必填 | 类型      | 说明                            |
|-----|----|---------|-------------------------------|
| ac  | 是  | string  | 固定值为 `list`（实际参数中需存在`ac`和`t`） |
| t   | 是  | string  | 分类ID                          |
| pg  | 否  | integer | 页码，默认1                        |
| ext | 否  | string  | 筛选条件（base64编码的JSON字符串）        |

#### 请求示例

```http
GET /api/vod1?ac=cate&t=1&pg=2&ext=eyJuYW1lIjoi5paw5qW8In0=
```

#### 响应示例

```json
{
  "page": 2,
  "pagecount": 10,
  "list": [
    {
      "vod_id": "101",
      "vod_name": "电影名称",
      "vod_pic": "https://example.com/pic.jpg"
    }
  ]
}
```

### 3. 详情接口

**功能说明**：获取一个或多个视频的详细信息。

#### 请求参数

| 参数名 | 必填 | 类型     | 说明                                |
|-----|----|--------|-----------------------------------|
| ac  | 是  | string | 固定值为 `detail`（实际参数中需存在`ac`和`ids`） |
| ids | 是  | string | 视频ID，多个用逗号分隔                      |

#### 请求示例

```http
GET /api/vod1?ac=detail&ids=101,102
```

或

```http
POST /api/vod1
Content-Type: application/json
{
  "ac": "detail",
  "ids": "101,102"
}
```

#### 响应示例

```json
[
  {
    "vod_id": "101",
    "vod_name": "电影名称",
    "vod_actor": "主演",
    "vod_content": "剧情简介",
    "vod_play_url": "播放地址"
  }
]
```

### 4. 动作接口

**功能说明**：执行特定动作（如收藏、点赞等）。

#### 请求参数

| 参数名    | 必填 | 类型     | 说明                                   |
|--------|----|--------|--------------------------------------|
| ac     | 是  | string | 固定值为 `action`（实际参数中需存在`ac`和`action`） |
| action | 是  | string | 动作类型（如 `like`, `collect`）            |
| value  | 是  | string | 动作值（如 `1` 表示执行）                      |

#### 请求示例

```http
GET /api/vod1?ac=action&action=like&value=1
```

#### 响应示例

```json
{
  "code": 200,
  "msg": "操作成功"
}
```

[交互UI说明参考此处](./ruleAttr.md)

### 5. 搜索接口

**功能说明**：根据关键词搜索视频，支持快速搜索和分页。

#### 请求参数

| 参数名   | 必填 | 类型      | 说明              |
|-------|----|---------|-----------------|
| wd    | 是  | string  | 搜索关键词           |
| quick | 否  | integer | 快速搜索模式（0或1，默认0） |
| pg    | 否  | integer | 页码，默认1          |

#### 请求示例

```http
GET /api/vod1?wd=电影&quick=1&pg=1
```

#### 响应示例

```json
{
  "list": [
    {
      "vod_id": "201",
      "vod_name": "搜索到的电影",
      "vod_remarks": "6.5分"
    }
  ],
  "total": 50
}
```

### 6. 刷新接口

**功能说明**：强制刷新模块的初始化数据。

#### 请求参数

| 参数名     | 必填 | 类型     | 说明        |
|---------|----|--------|-----------|
| refresh | 是  | string | 任意值（存在即可） |

#### 请求示例

```http
GET /api/vod1?refresh=1
```

#### 响应示例

```json
{
  "code": 200,
  "msg": "刷新成功",
  "data": {
    "lastUpdate": "2023-08-01 12:00:00"
  }
}
```

### 7. 默认首页接口

**功能说明**：获取模块的首页数据（包括home和homeVod数据）。当没有匹配到上述任何功能时，调用此接口。

#### 请求参数

| 参数名    | 必填 | 类型      | 说明               |
|--------|----|---------|------------------|
| filter | 否  | integer | 过滤条件（1表示启用，默认启用） |

#### 请求示例

```http
GET /api/vod1
```

或

```http
GET /api/vod1?filter=1
```

#### 响应示例

```json
{
  "class": [
    {
      "type_id": "choice",
      "type_name": "精选"
    },
    {
      "type_id": "movie",
      "type_name": "电影"
    },
    {
      "type_id": "tv",
      "type_name": "电视剧"
    },
    {
      "type_id": "variety",
      "type_name": "综艺"
    },
    {
      "type_id": "cartoon",
      "type_name": "动漫"
    },
    {
      "type_id": "child",
      "type_name": "少儿"
    },
    {
      "type_id": "doco",
      "type_name": "纪录片"
    }
  ],
  "filters": {
  },
  "list": [
    {
      "vod_id": "301",
      "vod_name": "首页推荐电影",
      "vod_pic": "https://example.com/recommend.jpg"
    }
  ]
}
```

## 错误状态码

| 状态码 | 含义             | 说明        |
|-----|----------------|-----------|
| 404 | Not Found      | 模块不存在     |
| 500 | Internal Error | 服务器内部处理错误 |

## 注意事项

1. 参数`ext`（在分类接口中）是base64编码的JSON字符串，用于传递筛选条件。
2. 分页参数`pg`从1开始。
3. 参数`extend`（接口数据扩展）从sites的ext直接取字符串，若有就每个接口都加上。
   开发人员可参考此文档进行对接。
4. 除`action`外的接口，尽量都用`get`协议,action由于传值可能较大推荐使用`post`