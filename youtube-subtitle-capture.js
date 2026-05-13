// youtube-subtitle.js
const NTFY_TOPIC = "stash-youtube-2673949";

function extractText(text){
    if(!text) return "";
    if(text.includes("<text")) return text.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
    if(text.startsWith("{")) try{ return JSON.parse(text).events.map(e=>e.segs?.map(s=>s.utf8||"").join("")).join(" ") }catch{}
    if(text.includes("-->")||text.includes("WEBVTT")) return text;
    return text;
}

if(typeof $response !== "undefined" && typeof $request !== "undefined"){
    // === HTTP Rewrite 抓取 ===
    try{
        const body = $response.body||"";
        const url = $request.url||"";
        const vidMatch = url.match(/v=([^&]+)/);
        const videoId = vidMatch? vidMatch[1]:"unknown";
        const subtitle = extractText(body);
        if(subtitle){
            $persistentStore.write(subtitle, `youtube_subtitle_${videoId}`);
            $persistentStore.write(url, `youtube_subtitle_url_${videoId}`);
        }
        // 获取标题
        $httpClient.get({url:`https://www.youtube.com/watch?v=${videoId}`, timeout:15}, (err, resp, data)=>{
            let title = videoId;
            if(!err && data){
                const m = data.match(/<title>(.*?)<\/title>/);
                if(m) title = m[1].replace(" - YouTube","").trim();
            }
            $persistentStore.write(title, `youtube_title_${videoId}`);
            // ntfy
            if(NTFY_TOPIC){
                $httpClient.post({
                    url: "https://ntfy.sh/" + encodeURIComponent(NTFY_TOPIC),
                    headers: {"Title": title,"Content-Type":"text/plain"},
                    body: `YouTube 字幕已抓取成功, Video ID: ${videoId}`
                }, ()=>{});
            }
        });
    }catch(e){}
    $done({});
}else{
    // === Tile 面板 ===
    const allKeys = $persistentStore.keys().filter(k=>k.startsWith("youtube_subtitle_")&&!k.endsWith("_url"));
    const latestId = allKeys.length? allKeys[allKeys.length-1].replace("youtube_subtitle_",""):null;
    if(!latestId){
        $done({title:"YouTube 字幕", content:"尚未抓取", icon:"play.rectangle", backgroundColor:"#888888"});
    }else{
        const subtitle = $persistentStore.read(`youtube_subtitle_${latestId}`);
        const title = $persistentStore.read(`youtube_title_${latestId}`) || latestId;
        const status = subtitle? "✅ 已抓取":"❌ 无字幕";
        $done({
            title:"YouTube 字幕",
            content:`${status} - ${title}`,
            icon:"play.rectangle.fill",
            backgroundColor: subtitle?"#34C759":"#FF3B30",
            url:`https://www.youtube.com/watch?v=${latestId}`
        });
    }
}