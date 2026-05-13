// youtube-subtitle-capture.js
// 简化版：抓取字幕 + persistentStore + ntfy 推送

const NTFY_TOPIC = "stash-youtube-2673949";

// 字幕解析
function extractText(text){
    if(!text) return "";
    if(text.includes("<text")) return text.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
    if(text.startsWith("{")) try { 
        return JSON.parse(text).events.map(e => e.segs?.map(s => s.utf8 || "").join("")).join(" "); 
    } catch{}
    if(text.includes("-->") || text.includes("WEBVTT")) return text;
    return text;
}

try {
    const body = $response.body || "";
    const url = $request.url || "";
    const vidMatch = url.match(/v=([^&]+)/);
    const videoId = vidMatch ? vidMatch[1] : "unknown";
    const subtitle = extractText(body);

    if(subtitle){
        // 写入 persistentStore
        $persistentStore.write(subtitle, `youtube_subtitle_${videoId}`);
        $persistentStore.write(url, `youtube_subtitle_url_${videoId}`);
    }

    // ntfy 推送
    if(NTFY_TOPIC){
        $httpClient.post({
            url: "https://ntfy.sh/" + encodeURIComponent(NTFY_TOPIC),
            headers: {"Title": videoId,"Content-Type":"text/plain"},
            body: `YouTube 字幕已抓取成功, Video ID: ${videoId}`
        }, ()=>{});
    }

    console.log(`[DEBUG] YouTube 字幕抓取完成, Video ID: ${videoId}`);
    $done({});

} catch(e){
    console.log(`[ERROR] YouTube 字幕抓取失败: ${e}`);
    $done({});
}