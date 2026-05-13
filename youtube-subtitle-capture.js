// youtube-subtitle-capture.js
// YouTube 字幕 + 视频标题抓取 + ntfy 通知

const NTFY_TOPIC = "stash-youtube-2673949";

try {
  const body = $response.body || "";
  const url = $request.url || "";
  const videoIdMatch = url.match(/v=([^&]+)/);
  const videoId = videoIdMatch ? videoIdMatch[1] : "unknown";

  // 简化字幕解析
  const subtitle = body.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();

  if(subtitle){
    $persistentStore.write(subtitle, `youtube_subtitle_${videoId}`);
    $persistentStore.write(url, `youtube_subtitle_url_${videoId}`);
  }

  // 抓取标题：请求 YouTube 页面
  $httpClient.get({
    url: `https://www.youtube.com/watch?v=${videoId}`,
    timeout: 15
  }, (err, resp, data) => {
    let title = videoId;
    if(!err && data){
      const match = data.match(/<title>(.*?)<\/title>/);
      if(match) title = match[1].replace(" - YouTube","").trim();
    }
    $persistentStore.write(title, `youtube_title_${videoId}`);

    // ntfy 通知
    if(NTFY_TOPIC){
      $httpClient.post({
        url: "https://ntfy.sh/" + encodeURIComponent(NTFY_TOPIC),
        headers: {"Title": title,"Content-Type":"text/plain"},
        body: `YouTube 字幕已抓取成功, Video ID: ${videoId}`
      }, ()=>{});
    }
  });

} catch(e){}

$done({});