// youtube-subtitle-capture.js
// 功能：抓取 YouTube 字幕接口响应，写入 Stash 日志，并通过 ntfy 推送完整字幕文本（不生成 attachment）

const NTFY_TOPIC = "stash-youtube-2673949";

let body = $response.body || "";
let requestUrl = $request.url || "";

// 提取视频 ID
let videoIdMatch = requestUrl.match(/v=([^&]+)/);
let videoId = videoIdMatch ? videoIdMatch[1] : "unknown";

// HTML / XML / JSON / VTT 解码
function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(text) {
  return text.replace(/<[^>]*>/g, "");
}

// XML 字幕解析
function parseXmlTimedText(text) {
  const results = [];
  const regex = /<text[^>]*start="([^"]*)"[^>]*?(?:dur="([^"]*)")?[^>]*>([\s\S]*?)<\/text>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const start = match[1] || "0";
    const dur = match[2] || "";
    let subtitle = match[3] || "";
    subtitle = decodeHtml(stripTags(subtitle)).replace(/\s+/g, " ").trim();
    if (subtitle) results.push(`[${start}s${dur ? " +" + dur + "s" : ""}] ${subtitle}`);
  }
  return results.join("\n");
}

// JSON3 字幕解析
function parseJson3(text) {
  try {
    const json = JSON.parse(text);
    const events = json.events || [];
    const results = [];
    for (const event of events) {
      if (!event.segs) continue;
      const start = event.tStartMs ? (event.tStartMs / 1000).toFixed(2) : "0";
      const subtitle = event.segs.map(seg => seg.utf8 || "").join("").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
      if (subtitle) results.push(`[${start}s] ${subtitle}`);
    }
    return results.join("\n");
  } catch (e) { return ""; }
}

// VTT 字幕解析
function parseVtt(text) {
  return text.split("\n").map(line => line.trim()).filter(line => {
    if (!line) return false;
    if (line === "WEBVTT") return false;
    if (/^Kind:/i.test(line)) return false;
    if (/^Language:/i.test(line)) return false;
    return true;
  }).join("\n");
}

// 自动判断格式
function extractSubtitle(text) {
  const t = text.trim();
  if (!t) return "";
  if (t.includes("<text")) return parseXmlTimedText(t);
  if (t.startsWith("{")) return parseJson3(t);
  if (t.includes("WEBVTT") || t.includes("-->")) return parseVtt(t);
  return t;
}

// ntfy 推送
function sendNtfy(title, content, callback) {
  if (!NTFY_TOPIC) { callback && callback(); return; }
  $httpClient.post({
    url: "https://ntfy.sh/" + encodeURIComponent(NTFY_TOPIC),
    headers: {
      "Title": title,
      "Priority": "default",
      "Content-Type": "text/plain; charset=utf-8"  // 确保是纯文本
    },
    body: content,  // 直接文本，不生成 attachment
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
    // 日志输出
    const logText =
      "\n========== YouTube Subtitle Captured ==========\n" +
      "Video ID: " + videoId + "\n" +
      "URL: " + requestUrl + "\n" +
      "---------------------------------------------\n" +
      subtitle +
      "\n==============================================\n";
    console.log(logText);

    // persistentStore 用视频 ID 单独存储
    $persistentStore.write(subtitle, `youtube_subtitle_${videoId}`);
    $persistentStore.write(requestUrl, `youtube_subtitle_url_${videoId}`);

    // 推送 ntfy
    sendNtfy(`YouTube Subtitle Captured [${videoId}]`, subtitle, () => {
      $done({});
    });
  }
} catch (e) {
  console.log("YouTube 字幕抓取失败: " + e);
  $done({});
}