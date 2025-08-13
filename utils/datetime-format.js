import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc.js';
import timezonePlugin from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';


// 扩展dayjs以支持自定义格式解析
dayjs.extend(customParseFormat);
dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);
export const toBeijingTime = (date) =>
    date ? dayjs(date).utc().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss') : null;