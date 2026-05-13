// youtube-subtitle-capture.js
const NTFY_TOPIC = "stash-youtube-2673949";

let body = $response.body || "";
let requestUrl = $request.url || "";

// 提取视频 ID
let videoIdMatch = requestUrl.match(/v=([^&]+)/);
let videoId = videoIdMatch ? videoIdMatch[1] : "unknown";

// HTML / XML / JSON / VTT 解码函数略（保持之前 decodeHtml, stripTags, parseXmlTimedText, parseJson3, parseVtt, extractSubtitle）
// ...

function sendNtfy(title, callback) {
  if (!NTFY_TOPIC) { callback && callback(); return; }
  $httpClient.post({
    url: "https://ntfy.sh/" + encodeURIComponent(NTFY_TOPIC),
    headers: {
      "Title": title,
      "Priority": "default",
      "Content-Type": "text/plain; charset=utf-8"
    },
    body: `YouTube 字幕已抓取成功，Video ID: ${title}`,
    timeout: 10
  }, (error, resp, data) => {
    if (error) console.log("ntfy 推送失败: " + error);
    else console.log("ntfy 推送成功: " + title);
    callback && callback();
  });
}

try {
  const subtitle = extractSubtitle(body);
  if (!subtitle) {
    console.log("没有解析到 YouTube 字幕内容");
    $done({});
  } else {
    // 日志只保留调试信息
    console.log(`[DEBUG] YouTube 字幕抓取完成，Video ID: ${videoId}`);

    // persistentStore 存储视频字幕和 URL
    $persistentStore.write(subtitle, `youtube_subtitle_${videoId}`);
    $persistentStore.write(requestUrl, `youtube_subtitle_url_${videoId}`);

    // ntfy 推送通知（不附加字幕内容）
    sendNtfy(videoId, () => {
      $done({});
    });
  }
} catch (e) {
  console.log("YouTube 字幕抓取失败: " + e);
  $done({});
}