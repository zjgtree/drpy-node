## API列表(一部分，逐步完善)

### ds

- 获取定时任务列表 [/tasks](/tasks)
- 立即执行全部任务 [/execute-now/:taskName](/execute-now/)
- 立即执行钉钉消息任务 [/execute-now/dingtalk_test](/execute-now/dingtalk_test)
- 立即执行企业微信消息任务 [/execute-now/wechat_test](/execute-now/wechat_test)
- 立即执行吾爱论坛签到任务 [/execute-now/52pojie_sign](/execute-now/52pojie_sign) | [说明](./cron/52pojie_sign.md)
- 获取指定任务信息 [/tasks/:taskName](/tasks/)

### hipy

- 检查python环境 [/health](/health)