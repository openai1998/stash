// youtube-subtitle-capture.js
// 改版：日志不存完整字幕，每个视频独立存储 persistentStore
// ntfy 仅通知抓取完成

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

function parseVtt(text) {
  return text.split("\n").map(line => line.trim()).filter(line => {
    if (!line) return false;
    if (line === "WEBVTT") return false;
    if (/^Kind:/i.test(line)) return false;
    if (/^Language:/i.test(line)) return false;
    return true;
  }).join("\n");
}

function extractSubtitle(text) {
  const t = text.trim();
  if (!t) return "";
  if (t.includes("<text")) return parseXmlTimedText(t);
  if (t.startsWith("{")) return parseJson3(t);
  if (t.includes("WEBVTT") || t.includes("-->")) return parseVtt(t);
  return t;
}

// ntfy 推送（仅通知抓取完成）
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

// 可选：清理旧日志（只保留调试信息）
function cleanLogs() {
  console.log("触发日志清理，可选实现");
  // 实际实现可以调用 Stash 清理日志 API 或保留最近 N 天日志
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
      // 可选：触发日志清理
      cleanLogs();
      $done({});
    });
  }
} catch (e) {
  console.log("YouTube 字幕抓取失败: " + e);
  $done({});
}