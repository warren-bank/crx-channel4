// ----------------------------------------------------------------------------- decrypt token

{
  // load "aes-js"
  const s = document.createElement('script')
  s.setAttribute('src', 'https://cdn.jsdelivr.net/gh/ricmoo/aes-js@3.1.2/index.js')
  document.body.appendChild(s)
}

const video_profile_names = {WIDEVINE:"dashwv-dyn-stream-1",FAIR_PLAY:"hls-dyn-stream-1",PLAY_READY:"dashpr-dyn-stream-1"}

const base64DecodeUint8Array = function(e) {
  for (var t = window.atob(e), r = t.length, n = new Uint8Array(new ArrayBuffer(r)), i = 0; i < r; i += 1) n[i] = t.charCodeAt(i);
  return n
}

//ab2str
const arrayBuffer_to_string = function(e, t) {
  return String.fromCharCode.apply(null, t === video_profile_names.PLAY_READY ? new Uint16Array(e) : new Uint8Array(e))
}

const getVODBSMessage = function(key, iv, token, video_profile_name) {
  key = aesjs.utils.utf8.toBytes(key)
  iv  = aesjs.utils.utf8.toBytes(iv)

  const encryptedBytes = base64DecodeUint8Array(token)
  const aesCbc = new aesjs.ModeOfOperation.cbc(key, iv)
  const decryptedBytes = aesCbc.decrypt(encryptedBytes, false)
  const strippedBytes = aesjs.padding.pkcs7.strip(decryptedBytes)
  const message = arrayBuffer_to_string(strippedBytes, video_profile_name)

  return message
}

// ----------------------------------------------------------------------------- download decryption parameters

const download_decryption_parameters = async () => {
  let bundle_js

  // download bundle
  bundle_js = await fetch('https://static.c4assets.com/all4-player/latest/bundle.app.js').then(res => res.text())

  // extract desired export
  bundle_js = find_needle({
    haystack: bundle_js,
    needle:   'e.exports=JSON.parse(\'{"baseUrl":"//www.channel4.com",',
    tail:     'e.exports=',
    strict:   true
  })

  const key = find_needle({
    haystack: bundle_js,
    needle:   ',"bytes1":"',
    tail:     '"',
    strict:   true
  })

  const iv = find_needle({
    haystack: bundle_js,
    needle:   ',"bytes2":"',
    tail:     '"',
    strict:   true
  })

  // extract Widevine drmtoday
  bundle_js = find_needle({
    haystack: bundle_js,
    needle:   ',"drmtoday":{',
    tail:     '}},',
    strict:   true
  })

  const video_type = find_needle({
    haystack: bundle_js,
    needle:   '"video":{"type":"',
    tail:     '"',
    strict:   true
  })

  return {key, iv, video_type}
}

var find_needle = function(data) {
  var index_start, index_stop

  index_start = data.haystack.indexOf(data.needle)
  if (index_start >= 0) {
    index_start += data.needle.length
    index_stop = data.haystack.indexOf(data.tail, index_start)
    if ((index_stop === -1) && !data.strict) {
      index_stop = data.haystack.length
    }
    if (index_stop >= index_start) {
      return data.haystack.substring(index_start, index_stop)
    }
  }
  return null
}

// ----------------------------------------------------------------------------- download encrypted video data

const download_encrypted_video_data = (programmeId) => {
  return fetch(`https://www.channel4.com/vod/stream/${programmeId}`)
    .then(res => res.json())
    .then(data => data.videoProfiles
      .filter(profile => profile.name === 'dashwv-dyn-stream-1')
      .map(profile => profile.streams
        .map(stream => ({video_url: stream.uri, encrypted_token: stream.token}))
      )
      .reduce((all, some) => [...all, ...some], [])
    )
    .then(streams => streams.length ? streams[0] : {})
}

// ----------------------------------------------------------------------------- aio

const get_video_data = async (programmeId, assetId) => {
  const {key, iv, video_type} = await download_decryption_parameters()
  const {video_url, encrypted_token} = await download_encrypted_video_data(programmeId)

  if (!key || !iv || !video_type) {
    console.log('failed to parse video player JS bundle')
    return
  }

  if (!video_url || !encrypted_token) {
    console.log('failed to obtain encrypted video data from API server')
    return
  }

  const decrypted_message = getVODBSMessage(key, iv, encrypted_token, video_profile_names.WIDEVINE)

  if (!decrypted_message) {
    console.log('failed to decrypt token')
    return
  }

  const [license_url, token] = decrypted_message.split('|', 2)

  return {
    license_url,
    request_id: assetId,
    token,
    video_url,
    video_type
  }
}

// ----------------------------------------------------------------------------- pass video data to ExoAirPlayer sender

const get_video_player_sender_url = (video_data, base_widevine_license_proxy_url = 'http://localhost:8080/channel4') => {
  const widevine_license_proxy_url = base_widevine_license_proxy_url + '?' + Object.keys(video_data).map(key => key + '=' + btoa(video_data[key])).join('&')

  const video_player_data = {
    video_url:   video_data.video_url,
    video_type:  'application/dash+xml',
    caption_url: null,
    referer_url: 'https://www.channel4.com/',
    drm: {
      scheme:    'widevine',
      server:    widevine_license_proxy_url,
      headers:   null
    }
  }

  return get_webcast_reloaded_url_airplay_sender(video_player_data, true, false)
}

var get_webcast_reloaded_url = function(video_data, force_http, force_https) {
  force_http  = (typeof force_http  === 'boolean') ? force_http  : user_options.greasemonkey.force_http
  force_https = (typeof force_https === 'boolean') ? force_https : user_options.greasemonkey.force_https

  var encoded_video_url, encoded_caption_url, encoded_referer_url, encoded_drm_url, webcast_reloaded_base, webcast_reloaded_url

  encoded_video_url      = encodeURIComponent(encodeURIComponent(btoa(video_data.video_url)))
  encoded_caption_url    = video_data.caption_url ? encodeURIComponent(encodeURIComponent(btoa(video_data.caption_url))) : null
  video_data.referer_url = video_data.referer_url ? video_data.referer_url : unsafeWindow.location.href
  encoded_referer_url    = encodeURIComponent(encodeURIComponent(btoa(video_data.referer_url)))
  encoded_drm_url        = (video_data.drm.scheme && video_data.drm.server) ? encodeURIComponent(encodeURIComponent(btoa(video_data.drm.scheme + '|' + video_data.drm.server))) : null

  webcast_reloaded_base = {
    "https": "https://warren-bank.github.io/crx-webcast-reloaded/external_website/index.html",
    "http":  "http://webcast-reloaded.frii.site/index.html"
  }

  webcast_reloaded_base = (force_http)
                            ? webcast_reloaded_base.http
                            : (force_https)
                               ? webcast_reloaded_base.https
                               : (video_data.video_url.toLowerCase().indexOf('http:') === 0)
                                  ? webcast_reloaded_base.http
                                  : webcast_reloaded_base.https

  webcast_reloaded_url  = webcast_reloaded_base    + '#/watch/'    + encoded_video_url
                            + (encoded_caption_url ? ('/subtitle/' + encoded_caption_url) : '')
                            + (encoded_referer_url ? ('/referer/'  + encoded_referer_url) : '')
                            + (encoded_drm_url     ? ('/drm/'      + encoded_drm_url) : '')

  return webcast_reloaded_url
}

var get_webcast_reloaded_url_airplay_sender = function(video_data) {
  return get_webcast_reloaded_url(video_data, /* force_http= */ true, /* force_https= */ false).replace('/index.html', '/airplay_sender.es5.html')
}

// ----------------------------------------------------------------------------- init

const init = async (programmeId, assetId, base_widevine_license_proxy_url) => {
  const video_data = await get_video_data(programmeId, assetId)
  const video_player_sender_url = get_video_player_sender_url(video_data, base_widevine_license_proxy_url)

  console.log(video_player_sender_url)
}

// ----------------------------------------------------------------------------- bootstrap init

init('77468-001', '12137686', 'http://192.168.0.2:8080/channel4')
