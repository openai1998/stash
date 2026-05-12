// youtube-subtitle-capture.js
// 功能：抓取 YouTube 字幕接口响应，解析字幕，写入 Stash 日志，并发送 Bark 通知

const BARK_KEY = "你的BarkKey"; // 不用 Bark 就留空：const BARK_KEY = "";

let body = $response.body || "";
let requestUrl = $request.url || "";

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
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

    if (subtitle) {
      results.push(`[${start}s${dur ? " +" + dur + "s" : ""}] ${subtitle}`);
    }
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
      const subtitle = event.segs
        .map(seg => seg.utf8 || "")
        .join("")
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (subtitle) {
        results.push(`[${start}s] ${subtitle}`);
      }
    }

    return results.join("\n");
  } catch (e) {
    return "";
  }
}

function parseVtt(text) {
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false;
      if (line === "WEBVTT") return false;
      if (/^Kind:/.test(line)) return false;
      if (/^Language:/.test(line)) return false;
      return true;
    })
    .join("\n");
}

function extractSubtitle(text) {
  const t = text.trim();

  if (!t) return "";

  if (t.includes("<text")) {
    return parseXmlTimedText(t);
  }

  if (t.startsWith("{")) {
    return parseJson3(t);
  }

  if (t.includes("WEBVTT") || t.includes("-->")) {
    return parseVtt(t);
  }

  return t;
}

function barkNotify(title, content) {
  if (!BARK_KEY) return;

  const url =
    "https://api.day.app/" +
    encodeURIComponent(BARK_KEY) +
    "/" +
    encodeURIComponent(title) +
    "/" +
    encodeURIComponent(content);

  $httpClient.get({ url, timeout: 10 }, (error) => {
    if (error) {
      console.log("Bark 推送失败: " + error);
    } else {
      console.log("Bark 推送成功");
    }
  });
}

try {
  const subtitle = extractSubtitle(body);

  if (!subtitle) {
    console.log("没有解析到 YouTube 字幕内容");
    $done({});
  } else {
    const output =
      "\n========== YouTube Subtitle Captured ==========\n" +
      "URL: " + requestUrl + "\n" +
      "----------------------------------------------\n" +
      subtitle +
      "\n==============================================\n";

    console.log(output);

    $persistentStore.write(subtitle, "youtube_last_subtitle");
    $persistentStore.write(requestUrl, "youtube_last_subtitle_url");

    barkNotify("YouTube 字幕已抓取", "已写入 Stash 日志，可打开日志复制");

    // 不修改 YouTube 原字幕，只旁路抓取
    $done({});
  }
} catch (e) {
  console.log("YouTube 字幕抓取失败: " + e);
  $done({});
}