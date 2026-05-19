/**
 * 简单的钉钉机器人消息发送测试。
 *
 * 使用方式：
 *   node dingding.js
 *
 * 如果要连接真实的钉钉机器人，请先把下面的假数据替换成真实的机器人 webhook access_token。
 * 如果机器人开启了“加签”安全设置，也需要替换对应的 secret。
 */

const https = require('https');
const crypto = require('crypto');

// 必填：这里先填写假 token，实际使用时替换成钉钉机器人 webhook 里的 access_token。
const DINGTALK_ACCESS_TOKEN = 'fake_access_token_replace_me';

// 可选：如果钉钉机器人开启了“加签”，这里替换成真实 secret。
// 如果没有开启加签，可以把这里改成空字符串：''。
const DINGTALK_SECRET = 'fake_secret_replace_me';

const TEST_MESSAGE = '你好，我是测试test';

function buildWebhookUrl() {
  const url = new URL('https://oapi.dingtalk.com/robot/send');
  url.searchParams.set('access_token', DINGTALK_ACCESS_TOKEN);

  if (DINGTALK_SECRET) {
    const timestamp = Date.now();
    const stringToSign = `${timestamp}\n${DINGTALK_SECRET}`;
    const sign = crypto
      .createHmac('sha256', DINGTALK_SECRET)
      .update(stringToSign)
      .digest('base64');

    url.searchParams.set('timestamp', String(timestamp));
    url.searchParams.set('sign', sign);
  }

  return url;
}

function sendDingTalkTextMessage(content) {
  const body = JSON.stringify({
    msgtype: 'text',
    text: {
      content,
    },
  });

  const url = buildWebhookUrl();

  const options = {
    method: 'POST',
    hostname: url.hostname,
    path: `${url.pathname}${url.search}`,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseBody = '';

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: responseBody,
        });
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

sendDingTalkTextMessage(TEST_MESSAGE)
  .then((result) => {
    console.log('DingTalk response:', result);
  })
  .catch((error) => {
    console.error('Failed to send DingTalk message:', error.message);
    process.exitCode = 1;
  });
