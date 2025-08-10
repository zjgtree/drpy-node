import axios from 'axios';

export default class MessageSender {
    static TYPE = {
        DINGDING: 0,
        WECHAT: 1,
        // 未来可扩展更多类型...
    };

    /**
     * 发送消息
     * @param {string} text 消息文本
     * @param {number} type 消息类型（0: 钉钉，1: 企业微信），默认 0
     */
    static async send(text, type = MessageSender.TYPE.DINGDING) {
        if (!text || typeof text !== 'string') {
            console.warn('[MessageSender] 消息内容必须是字符串');
            return;
        }

        switch (type) {
            case MessageSender.TYPE.DINGDING:
                await this.#sendDingDing(text);
                break;

            case MessageSender.TYPE.WECHAT:
                await this.#sendWeChat(text);
                break;

            default:
                console.warn(`[MessageSender] 不支持的消息类型: ${type}`);
        }
    }

    static async #sendDingDing(text) {
        const {dingding_webhook} = process.env;
        if (!dingding_webhook) {
            console.log('[MessageSender] 未配置 dingding_webhook，跳过钉钉发送');
            return;
        }
        try {
            await axios.post(dingding_webhook, {
                msgtype: 'text',
                text: {content: text}
            });
            console.log('[MessageSender] 钉钉消息已发送');
        } catch (err) {
            console.error('[MessageSender] 钉钉消息发送失败:', err.message);
        }
    }

    static async #sendWeChat(text) {
        const {wechat_webhook} = process.env;
        if (!wechat_webhook) {
            console.log('[MessageSender] 未配置 wechat_webhook，跳过企业微信发送');
            return;
        }
        try {
            await axios.post(wechat_webhook, {
                msgtype: 'text',
                text: {content: text}
            });
            console.log('[MessageSender] 企业微信消息已发送');
        } catch (err) {
            console.error('[MessageSender] 企业微信消息发送失败:', err.message);
        }
    }
}
