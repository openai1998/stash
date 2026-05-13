// YouTube 字幕抓取 + Tile 状态更新
const NTFY_TOPIC = "stash-youtube-2673949";

let body = $response.body || "";
let requestUrl = $request.url || "";

let videoIdMatch = requestUrl.match(/v=([^&]+)/);
let videoId = videoIdMatch ? videoIdMatch[1] : "unknown";

function decodeHtml(text) {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<")
             .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
             .replace(/&#39;/g, "'")
             .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(text) { return text.replace(/<[^>]*>/g, ""); }

function parseXmlTimedText(text) {
  const results = [];
  const regex = /<text[^>]*start="([^"]*)"[^>]*?(?:dur="([^"]*)")?[^>]*>([\s\S]*?)<\/text>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const start = match[1] || "0";
    const dur = match[2] || "";
    let subtitle = decodeHtml(stripTags(match[3] || "")).replace(/\s+/g, " ").trim();
    if (subtitle) results.push(`[${start}s${dur ? " +" + dur + "s" : ""}] ${subtitle}`);
  }
  return results.join("\n");
}

function parseJson3(text) {
  try {
    const events = JSON.parse(text).events || [];
    return events
      .filter(e => e.segs)
      .map(e => {
        const start = e.tStartMs ? (e.tStartMs / 1000).toFixed(2) : "0";
        const subtitle = e.segs.map(seg => seg.utf8 || "").join("").replace(/\s+/g, " ").trim();
        return subtitle ? `[${start}s] ${subtitle}` : "";
      })
      .filter(Boolean)
      .join("\n");
  } catch { return ""; }
}

function parseVtt(text) {
  return text.split("\n").map(l => l.trim())
             .filter(l => l && l !== "WEBVTT" && !/^Kind:/i.test(l) && !/^Language:/i.test(l))
             .join("\n");
}

function extractSubtitle(text) {
  const t = text.trim();
  if (!t) return "";
  if (t.includes("<text")) return parseXmlTimedText(t);
  if (t.startsWith("{")) return parseJson3(t);
  if (t.includes("WEBVTT") || t.includes("-->")) return parseVtt(t);
  return t;
}

// ntfy 推送（可选）
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
  }, () => callback && callback());
}

try {
  const subtitle = extractSubtitle(body);
  const status = subtitle ? "✅ 成功抓取" : "❌ 无字幕";

  // 存储字幕和 URL
  if (subtitle) {
    $persistentStore.write(subtitle, `youtube_subtitle_${videoId}`);
    $persistentStore.write(requestUrl, `youtube_subtitle_url_${videoId}`);
  }

  // ntfy 通知
  sendNtfy(videoId, () => {
    // 更新 Tile
    $done({
      title: `YouTube 字幕`,
      content: `${status} (${videoId})`,
      icon: "play.rectangle.fill",
      backgroundColor: subtitle ? "#34C759" : "#FF3B30",
      url: `https://www.youtube.com/watch?v=${videoId}`
    });
  });

} catch {
  $done({
    title: `YouTube 字幕`,
    content: `❌ 抓取失败 (${videoId})`,
    icon: "exclamationmark.triangle.fill",
    backgroundColor: "#FF3B30",
    url: `https://www.youtube.com/watch?v=${videoId}`
  });
}