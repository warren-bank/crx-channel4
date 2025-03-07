// ==UserScript==
// @name         channel4
// @description  Improve site usability. Watch videos in external player.
// @version      1.0.0
// @match        *://*.channel4.com/now/*
// @match        *://*.channel4.com/programmes/*
// @icon         https://www.channel4.com/favicon.ico
// @require      https://cdn.jsdelivr.net/gh/ricmoo/aes-js@3.1.2/index.js
// @run-at       document-end
// @grant        unsafeWindow
// @homepage     https://github.com/warren-bank/crx-channel4/tree/webmonkey-userscript/es5
// @supportURL   https://github.com/warren-bank/crx-channel4/issues
// @downloadURL  https://github.com/warren-bank/crx-channel4/raw/webmonkey-userscript/es5/webmonkey-userscript/channel4.user.js
// @updateURL    https://github.com/warren-bank/crx-channel4/raw/webmonkey-userscript/es5/webmonkey-userscript/channel4.user.js
// @namespace    warren-bank
// @author       Warren Bank
// @copyright    Warren Bank
// ==/UserScript==

// ----------------------------------------------------------------------------- user options

var user_options = {
  "drm": {
    "widevine_license_proxy":           "http://localhost:8080/channel4",
    "use_static_decryption_parameters": true // `true`: use values in all4 video player JS bundle when userscript was last updated. `false`: download and extract at runtime.
  },
  "common": {
    "debug_verbosity":              0,  // 0 = silent. 1 = console log. 2 = window alert. 3 = window alert + conditional breakpoint.
    "init_delay_ms":                5000,
    "sort_newest_first":            false
  },
  "webmonkey": {
    "post_intent_redirect_to_url":  null  // "about:blank"
  },
  "greasemonkey": {
    "redirect_to_webcast_reloaded": true,
    "force_http":                   true,
    "force_https":                  false
  }
}

// ----------------------------------------------------------------------------- constants

var constants = {
  "button_attributes": {
    "vod_programme_id":             "x-vod-programme-id",
    "vod_asset_id":                 "x-vod-asset-id",

    "livetv_channel_id":            "x-livetv-channel-id",

    "video_url":                    "x-video-url",
    "video_type":                   "x-video-type",
    "caption_url":                  "x-caption-url",
    "referer_url":                  "x-referer-url",
    "drm_scheme":                   "x-drm-scheme",
    "drm_server":                   "x-drm-server"
  },
  "img_urls": {
    "base_webcast_reloaded_icons":  "https://github.com/warren-bank/crx-webcast-reloaded/raw/gh-pages/chrome_extension/2-release/popup/img/"
  }
}

var strings = {
  "button_download_video":          "Get Video URL",
  "button_start_video":             "Start Video",
  "episode_labels": {
    "season_number":                "Season #:",
    "episode_number":               "Episode #:",
    "title":                        "Title:",
    "summary":                      "Summary:",
    "duration":                     "Duration:",
    "video": {
      "format":                     "Format:",
      "drm":                        "DRM:"
    }
  },
  "livetv_epg_toggle_button": {
    "show":                         "Show",
    "hide":                         "Hide"
  },
  "livetv_channel_labels": {
    "epg": {
      "series_title":               "Title:",
      "season_number":              "Season #:",
      "episode_number":             "Episode #:",
      "episode_title_1":            "Episode Title:",
      "episode_title_2":            "",
      "episode_summary":            "Summary:",
      "duration_date_range":        "Time:",
      "duration":                   "Duration:"
    }
  }
}

// ----------------------------------------------------------------------------- state

var state = {
  "decryption_parameters": {
    "key":        "n9cLieYkqwzNCqvi",
    "iv":         "odzcU3WdUiXLucVd",
    "video_type": "ondemand"
  },

  series:     {}, // {title, summary}
  episodes:   [], // [{programme_id, asset_id, season_number, episode_number, title, summary, duration}]
  current_episode_index: -1,

  livetv_channels: [], // [{channel_id, epg: [{series_title, season_number, episode_number, episode_title_1, episode_title_2, episode_summary, duration_date_range, duration}]}]
  current_livetv_channel_index: -1
}

// ----------------------------------------------------------------------------- CSP

// add support for CSP 'Trusted Type' assignment
var add_default_trusted_type_policy = function() {
  if (typeof unsafeWindow.trustedTypes !== 'undefined') {
    try {
      var passthrough_policy = function(string) {return string}

      unsafeWindow.trustedTypes.createPolicy('default', {
          createHTML:      passthrough_policy,
          createScript:    passthrough_policy,
          createScriptURL: passthrough_policy
      })
    }
    catch(e) {}
  }
}

// ----------------------------------------------------------------------------- debug logger

var debug = function(msg, breakpoint) {
  if (!user_options.common.debug_verbosity) return

  if (msg) {
    if (typeof msg !== 'string')
      msg = JSON.stringify(msg, null, 2)

    switch(user_options.common.debug_verbosity) {
      case 1:
        console.log(msg)
        break
      case 2:
      case 3:
        unsafeWindow.alert(msg)
        break
    }
  }

  if (breakpoint && (user_options.common.debug_verbosity > 2))
    debugger;
}

// ----------------------------------------------------------------------------- helpers (xhr)

var serialize_xhr_body_object = function(data) {
  if (typeof data === 'string')
    return data

  if (!(data instanceof Object))
    return null

  var body = []
  var keys = Object.keys(data)
  var key, val
  for (var i=0; i < keys.length; i++) {
    key = keys[i]
    val = data[key]
    val = unsafeWindow.encodeURIComponent(val)

    body.push(key + '=' + val)
  }
  body = body.join('&')
  return body
}

var download_text = function(url, headers, data, withCredentials, callback) {
  if (data) {
    if (!headers)
      headers = {}
    if (!headers['content-type'])
      headers['content-type'] = 'application/x-www-form-urlencoded'

    switch(headers['content-type'].toLowerCase()) {
      case 'application/json':
        data = JSON.stringify(data)
        break

      case 'application/x-www-form-urlencoded':
      default:
        data = serialize_xhr_body_object(data)
        break
    }
  }

  var xhr    = new unsafeWindow.XMLHttpRequest()
  var method = data ? 'POST' : 'GET'

  xhr.open(method, url, true, null, null)
  xhr.withCredentials = !!withCredentials

  if (headers && (typeof headers === 'object')) {
    var keys = Object.keys(headers)
    var key, val
    for (var i=0; i < keys.length; i++) {
      key = keys[i]
      val = headers[key]
      xhr.setRequestHeader(key, val)
    }
  }

  xhr.onload = function(e) {
    if (xhr.readyState === 4) {
      if ((xhr.status >= 200) && (xhr.status < 300)) {
        callback(null, xhr.responseText)
        return
      }
    }
    callback(new Error())
  }

  xhr.onerror = function(e) {
    callback(new Error())
  }

  if (data)
    xhr.send(data)
  else
    xhr.send()
}

var download_json = function(url, headers, data, withCredentials, callback) {
  if (!headers)
    headers = {}
  if (!headers.accept)
    headers.accept = 'application/json'

  download_text(url, headers, data, withCredentials, function(error, text){
    try {
      if (error)
        callback(error)
      else
        callback(null, JSON.parse(text))
    }
    catch(e) {}
  })
}

// ----------------------------------------------------------------------------- helpers

var make_element = function(elementName, html, text) {
  var el = unsafeWindow.document.createElement(elementName)

  if (html)
    el.innerHTML = html

  if (text)
    el.textContent = text

  return el
}

var make_span = function(text) {return make_element('span', null, text)}
var make_h4   = function(text) {return make_element('h4',   null, text)}

var add_style_element = function(css) {
  if (!css) return

  var head = unsafeWindow.document.getElementsByTagName('head')[0]
  if (!head) return

  if ('function' === (typeof css))
    css = css()
  if (Array.isArray(css))
    css = css.join("\n")

  head.appendChild(
    make_element('style', null, css)
  )
}

var empty_element = function(el, html, text) {
  while (el.childNodes.length)
    el.removeChild(el.childNodes[0])

  if (html)
    el.innerHTML = html

  if (text)
    el.textContent = text

  return el
}

var append_tr = function(tr, td, colspan) {
  if (Array.isArray(td))
    tr.push('<tr><td>' + td.join('</td><td>') + '</td></tr>')
  else if ((typeof colspan === 'number') && (colspan > 1))
    tr.push('<tr><td colspan="' + colspan + '">' + td + '</td></tr>')
  else
    tr.push('<tr><td>' + td + '</td></tr>')
}

var cancel_event = function(event) {
  event.stopPropagation();event.stopImmediatePropagation();event.preventDefault();event.returnValue=false;
}

// https://stackoverflow.com/a/66696162
var convertSecondsToReadableString = function(seconds) {
  seconds = seconds || 0
  seconds = Number(seconds)
  seconds = Math.abs(seconds)

  var seconds_per_minute = 60
  var seconds_per_hour   = seconds_per_minute * 60
  var seconds_per_day    = seconds_per_hour * 24
  var seconds_per_year   = seconds_per_day * 365

  var y = Math.floor(seconds / seconds_per_year)
  var d = Math.floor((seconds % seconds_per_year) / seconds_per_day)
  var h = Math.floor((seconds % seconds_per_day)  / seconds_per_hour)
  var m = Math.floor((seconds % seconds_per_hour) / seconds_per_minute)
  var s = Math.floor( seconds % seconds_per_minute)

  var parts = []

  if (y > 0) {
    parts.push(y + ' year' + (y > 1 ? 's' : ''))
  }
  if (d > 0) {
    parts.push(d + ' day' + (d > 1 ? 's' : ''))
  }
  if (h > 0) {
    parts.push(h + ' hour' + (h > 1 ? 's' : ''))
  }
  if (m > 0) {
    parts.push(m + ' minute' + (m > 1 ? 's' : ''))
  }
  if (s > 0) {
    parts.push(s + ' second' + (s > 1 ? 's' : ''))
  }
  return parts.join(', ')
}

var convertDateRangeToReadableString = function(start_date, end_date) {
  start_date = new Date(start_date)
  end_date   = new Date(end_date)

  var parts = {
    start_date: start_date.toLocaleDateString(),
    start_time: start_date.toLocaleTimeString(),

    end_date:   end_date.toLocaleDateString(),
    end_time:   end_date.toLocaleTimeString()
  }

  var range = parts.start_date + ' ' + parts.start_time + ' - ' + ((parts.end_date !== parts.start_date) ? (parts.end_date + ' ') : '') + parts.end_time
  return range
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

// ----------------------------------------------------------------------------- URL links to tools on Webcast Reloaded website

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

var get_webcast_reloaded_url_chromecast_sender = function(video_data) {
  return get_webcast_reloaded_url(video_data, /* force_http= */ null, /* force_https= */ null).replace('/index.html', '/chromecast_sender.html')
}

var get_webcast_reloaded_url_airplay_sender = function(video_data) {
  return get_webcast_reloaded_url(video_data, /* force_http= */ true, /* force_https= */ false).replace('/index.html', '/airplay_sender.es5.html')
}

var get_webcast_reloaded_url_proxy = function(video_data) {
  return get_webcast_reloaded_url(video_data, /* force_http= */ true, /* force_https= */ false).replace('/index.html', '/proxy.html')
}

var get_webcast_reloaded_urls = function(video_data) {
  return {
    "index":             get_webcast_reloaded_url(                  video_data),
    "chromecast_sender": get_webcast_reloaded_url_chromecast_sender(video_data),
    "airplay_sender":    get_webcast_reloaded_url_airplay_sender(   video_data),
    "proxy":             get_webcast_reloaded_url_proxy(            video_data)
  }
}

// ----------------------------------------------------------------------------- URL handlers

var redirect_to_url = function(url) {
  if (!url) return

  if (typeof GM_loadUrl === 'function') {
    if (typeof GM_resolveUrl === 'function')
      url = GM_resolveUrl(url, unsafeWindow.location.href) || url

    GM_loadUrl(url, 'Referer', unsafeWindow.location.href)
  }
  else {
    try {
      unsafeWindow.top.location = url
    }
    catch(e) {
      unsafeWindow.window.location = url
    }
  }
}

var process_webmonkey_post_intent_redirect_to_url = function() {
  var url = null

  if (typeof user_options.webmonkey.post_intent_redirect_to_url === 'string')
    url = user_options.webmonkey.post_intent_redirect_to_url

  if (typeof user_options.webmonkey.post_intent_redirect_to_url === 'function')
    url = user_options.webmonkey.post_intent_redirect_to_url()

  if (typeof url === 'string')
    redirect_to_url(url)
}

// -----------------------------------------------------------------------------

var process_video_data = function(data) {
  if (!data.video_url) return

  if (!data.referer_url)
    data.referer_url = unsafeWindow.location.href

  if (typeof GM_startIntent === 'function') {
    // running in Android-WebMonkey: open Intent chooser

    if (!data.video_type)
      data.video_type = ''

    var args = [
      /* action = */ 'android.intent.action.VIEW',
      /* data   = */ data.video_url,
      /* type   = */ data.video_type
    ]

    // extras:
    if (data.caption_url) {
      args.push('textUrl')
      args.push(data.caption_url)
    }
    if (data.referer_url) {
      args.push('referUrl')
      args.push(data.referer_url)
    }
    if (data.drm.scheme) {
      args.push('drmScheme')
      args.push(data.drm.scheme)
    }
    if (data.drm.server) {
      args.push('drmUrl')
      args.push(data.drm.server)
    }
    if (data.drm.headers && (typeof data.drm.headers === 'object')) {
      var drm_header_keys, drm_header_key, drm_header_val

      drm_header_keys = Object.keys(data.drm.headers)
      for (var i=0; i < drm_header_keys.length; i++) {
        drm_header_key = drm_header_keys[i]
        drm_header_val = data.drm.headers[drm_header_key]

        args.push('drmHeader')
        args.push(drm_header_key + ': ' + drm_header_val)
      }
    }

    GM_startIntent.apply(this, args)
    process_webmonkey_post_intent_redirect_to_url()
    return true
  }
  else if (user_options.greasemonkey.redirect_to_webcast_reloaded) {
    // running in standard web browser: redirect URL to top-level tool on Webcast Reloaded website

    redirect_to_url(
      get_webcast_reloaded_url(data)
    )
    return true
  }
  else {
    return false
  }
}

var process_hls_data = function(data) {
  data.video_type = 'application/x-mpegurl'
  process_video_data(data)
}

var process_dash_data = function(data) {
  data.video_type = 'application/dash+xml'
  process_video_data(data)
}

// -----------------------------------------------------------------------------

var process_video_url = function(video_url, video_type, caption_url, referer_url, drm_scheme, drm_server) {
  var data = {
    video_url:   video_url   || null,
    video_type:  video_type  || null,
    caption_url: caption_url || null,
    referer_url: referer_url || null,
    drm: {
      scheme:    drm_scheme,
      server:    drm_server,
      headers:   null
    }
  }

  process_video_data(data)
}

var process_hls_url = function(hls_url, caption_url, referer_url, drm_scheme, drm_server) {
  process_video_url(/* video_url= */ hls_url, /* video_type= */ 'application/x-mpegurl', caption_url, referer_url, drm_scheme, drm_server)
}

var process_dash_url = function(dash_url, caption_url, referer_url, drm_scheme, drm_server) {
  process_video_url(/* video_url= */ dash_url, /* video_type= */ 'application/dash+xml', caption_url, referer_url, drm_scheme, drm_server)
}

// ----------------------------------------------------------------------------- API: common utilities

var download_decryption_parameters = function(callback) {
  if (user_options.drm.use_static_decryption_parameters) {
    callback()
    return
  }

  download_text(
    /* url= */ 'https://static.c4assets.com/all4-player/latest/bundle.app.js',
    /* headers= */ null,
    /* data= */ null,
    /* withCredentials= */ false,
    function(error, bundle_js) {
      if (!error && bundle_js) {
        // extract desired export
        bundle_js = find_needle({
          haystack: bundle_js,
          needle:   'e.exports=JSON.parse(\'{"baseUrl":"//www.channel4.com",',
          tail:     'e.exports=',
          strict:   true
        })

        state.decryption_parameters.key = find_needle({
          haystack: bundle_js,
          needle:   ',"bytes1":"',
          tail:     '"',
          strict:   true
        })

        state.decryption_parameters.iv = find_needle({
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

        state.decryption_parameters.video_type = find_needle({
          haystack: bundle_js,
          needle:   '"video":{"type":"',
          tail:     '"',
          strict:   true
        })
      }
      callback()
    }
  )
}

// ----------------------------------------------------------------------------- API: scrape VOD (series and films) from DOM

var scrape_dom_data = function() {
  var scripts, json, data
  var needle = 'window.__PARAMS__ ='
  var dom_data = null

  scripts = unsafeWindow.document.querySelectorAll('script:not([src])')

  for (var i=0; i < scripts.length; i++) {
    json = scripts[i].textContent.trim()
    if (json && (json.indexOf(needle) === 0)) {
      try {
        data = JSON.parse(
          json.substring(needle.length, json.length).replaceAll(':undefined', ':null')
        )

        if (
          !data || (typeof data !== 'object') ||
          !data.initialData || (typeof data.initialData !== 'object') ||
          !data.initialData.brand || (typeof data.initialData.brand !== 'object') ||
          !Array.isArray(data.initialData.brand.episodes) || !data.initialData.brand.episodes
        ) throw 0

        dom_data = {
          programme: {
            series_id: data.initialData.brand.websafeTitle,
            title: data.initialData.brand.title,
            summary: (data.initialData.brand.summary || data.initialData.brand.shortSummary)
          },
          episodes: data.initialData.brand.episodes.map(function(episode) {
            return {
              programme_id:   episode.programmeId,
              asset_id:       episode.assetId,
              season_number:  episode.seriesNumber,
              episode_number: episode.episodeNumber,
              title:          (episode.fullTitle || episode.title || episode.secondaryTitle || episode.originalTitle),
              summary:        (episode.summary || episode.fullDescription || episode.description),
              duration:       episode.durationLabel
            }
          }),
          film: ((data.initialData.brand.allSeriesCount === 1) && (data.initialData.brand.allEpisodesCount === 1))
        }
      }
      catch(e) {
        dom_data = null
      }
      break
    }
  }

  return dom_data
}

// ----------------------------------------------------------------------------- API: extract VOD (series and films)

var process_series_media_items = function(dom_data, series_id, programme_id, callback) {
  // sanity check
  if (dom_data.programme.series_id !== series_id) return

  state.series = {
    title:   dom_data.programme.title,
    summary: dom_data.programme.summary
  }

  state.episodes = dom_data.episodes.filter(function(episode) {
    return episode.programme_id && episode.asset_id && episode.title
  })

  debug('episodes: ' + typeof state.episodes + ' (' + ((state.episodes === null) ? 'null' : state.episodes.length) + ')')
  if (!state.episodes || !state.episodes.length) return

  if (user_options.common.sort_newest_first)
    state.episodes.reverse()

  if (programme_id) {
    for (var i=0; i < state.episodes.length; i++) {
      if (state.episodes[i].programme_id === programme_id) {
        state.current_episode_index = i
        break
      }
    }
  }
  else if (dom_data.film || (state.episodes.length === 1)) {
    state.current_episode_index = 0
  }

  callback()
}

// ----------------------------------------------------------------------------- API: download livetv channels and EPG

var download_livetv_data = function(callback) {
  download_json(
    /* url= */ 'https://www.channel4.com/api/now-next',
    /* headers= */ null,
    /* data= */ null,
    /* withCredentials= */ false,
    function(error, livetv_data) {
      if (error) return

      callback(livetv_data)
    }
  )
}

// ----------------------------------------------------------------------------- API: extract live tv channels and EPG

var process_livetv_guide = function(livetv_data, channel_id, callback) {
  state.series = {
    title:   'Live TV Channels',
    summary: null
  }

  state.livetv_channels = normalize_livetv_channels_list(
    livetv_data
  )

  debug('live tv channels: ' + typeof state.livetv_channels + ' (' + ((state.livetv_channels === null) ? 'null' : state.livetv_channels.length) + ')')
  if (!state.livetv_channels || !state.livetv_channels.length) return

  if (channel_id) {
    for (var i=0; i < state.livetv_channels.length; i++) {
      if (state.livetv_channels[i].channel_id === channel_id) {
        state.current_livetv_channel_index = i
        break
      }
    }
  }

  callback()
}

var normalize_livetv_channels_list = function(all_channels) {
  if (
    !all_channels || (typeof all_channels !== 'object') ||
    !all_channels.slots || (typeof all_channels.slots !== 'object')
  ) return null

  var slot_keys = Object.keys(all_channels.slots)
  if (slot_keys.length === 0) return null

  var channels = {}
  var slot, broadcast, channel_id, duration_date_range, duration, epg
  for (var i=0; i < slot_keys.length; i++) {
    slot = all_channels.slots[ slot_keys[i] ]
    if (!Array.isArray(slot)) continue

    for (var j=0; j < slot.length; j++) {
      broadcast = slot[j]
      if (!broadcast || (typeof broadcast !== 'object') || !broadcast.channel || !broadcast.title || !broadcast.start || !broadcast.end) continue

      channel_id = broadcast.channel
      if (!channels[channel_id]) {
        channels[channel_id] = {channel_id, epg: []}
      }

      duration_date_range = convertDateRangeToReadableString(broadcast.start, broadcast.end)

      duration = broadcast.duration
        ? convertSecondsToReadableString(
            broadcast.duration
          )
        : null

      epg = {
        series_title:        broadcast.title,
        season_number:       (broadcast.episode ? broadcast.episode.seriesNumber   : null),
        episode_number:      (broadcast.episode ? broadcast.episode.episodeNumber  : null),
        episode_title_1:     (broadcast.episode ? broadcast.episode.title          : null),
        episode_title_2:     (broadcast.episode ? broadcast.episode.secondaryTitle : null),
        episode_summary:     broadcast.summary || (broadcast.episode ? broadcast.episode.summary : null),
        duration_date_range: duration_date_range,
        duration:            duration
      }
      channels[channel_id].epg.push(epg)
    }
  }

  channels = Object.values(channels)
  if (!channels.length) return null

  channels.sort(function(a, b) {
    return a.channel_id.localeCompare(b.channel_id)
  })

  return channels
}

// ----------------------------------------------------------------------------- API: download VOD video sources (episode in series, film)

var download_vod_video_sources = function(programme_id, asset_id, callback) {
  download_json(
    /* url= */ 'https://www.channel4.com/vod/stream/' + programme_id,
    /* headers= */ null,
    /* data= */ null,
    /* withCredentials= */ false,
    function(error, api_media_data) {
      if (error) return

      normalize_vod_api_media_data(api_media_data, asset_id, callback)
    }
  )
}

var normalize_vod_api_media_data = function(api_media_data, asset_id, callback) {
  if (!api_media_data || (typeof api_media_data !== 'object')) return

  var caption_url   = extract_caption_url(api_media_data.subtitlesAssets)
  var video_sources = extract_video_sources(api_media_data.videoProfiles, asset_id, caption_url)
  if (!video_sources || !video_sources.length) return

  callback(video_sources)
}

var extract_caption_url = function(subtitles_assets) {
  var caption_url = null
  var formats = {}
  var asset, len, ext

  if (Array.isArray(subtitles_assets)) {
    for (var i=0; i < subtitles_assets.length; i++) {
      asset = subtitles_assets[i]
      if (!asset || (typeof asset !== 'object') || !asset.url) continue

      len = asset.url.length
      ext = asset.url.substring(len - 3, len).toLowerCase()

      formats[ext] = asset.url
    }

    caption_url = formats.vtt || formats.srt || null
  }

  return caption_url
}

var extract_video_sources = function(video_profiles, asset_id, caption_url) {
  var video_sources = []
  var needle = 'dashwv-'
  var profile, stream, video_data

  if (Array.isArray(video_profiles)) {
    for (var i=0; i < video_profiles.length; i++) {
      profile = video_profiles[i]
      if (!profile || (typeof profile !== 'object') || !Array.isArray(profile.streams) || !profile.name || (profile.name.indexOf(needle) !== 0)) continue

      for (var j=0; j < profile.streams.length; j++) {
        stream = profile.streams[j]
        if (!stream || (typeof stream !== 'object') || !stream.uri || !stream.token) continue

        video_data = {
          video_url:   stream.uri,
          video_type:  'application/dash+xml',
          caption_url: caption_url,
          referer_url: null,
          drm: {
            scheme:    'widevine',
            server:    stream.token, // placeholder: will be resolved shortly..
            headers:   null
          }
        }

        video_sources.push(video_data)
      }
    }
  }

  resolve_drm_server_urls(video_sources, asset_id)

  return video_sources
}

// ----------------------------------------------------------------------------- API: download livetv channel video sources

var download_livetv_channel_video_sources = function(channel_id, callback) {
  download_json(
    /* url= */ 'https://www.channel4.com/simulcast/channels/' + channel_id,
    /* headers= */ null,
    /* data= */ null,
    /* withCredentials= */ false,
    function(error, api_media_data) {
      if (error) return

      normalize_livetv_channel_api_media_data(api_media_data, callback)
    }
  )
}

var normalize_livetv_channel_api_media_data = function(api_media_data, callback) {
  if (
    !api_media_data || (typeof api_media_data !== 'object') ||
    !api_media_data.channelInfo || (typeof api_media_data.channelInfo !== 'object')
  ) return

  var video_sources = extract_video_sources(api_media_data.channelInfo.videoProfiles, null, null)
  if (!video_sources || !video_sources.length) return

  callback(video_sources)
}

// ----------------------------------------------------------------------------- API: re-route DRM requests to Widevine license server through proxy

var resolve_drm_server_urls = function(video_sources, request_id) {
  var video_data, video_url, decrypted_token

  for (var i=0; i < video_sources.length; i++) {
    video_data = video_sources[i]
    video_url = video_data.video_url
    decrypted_token = decrypt_drm_token( video_data.drm.server )

    if (decrypted_token)
      video_data.drm.server = get_drm_server_url(video_url, decrypted_token, request_id)

    if (!decrypted_token || !video_data.drm.server)
      video_sources[i] = null
  }
}

var decrypt_drm_token = function(encrypted_token) {
  var key = aesjs.utils.utf8.toBytes( state.decryption_parameters.key )
  var iv  = aesjs.utils.utf8.toBytes( state.decryption_parameters.iv  )

  var encrypted_bytes = base64_to_Uint8Array(encrypted_token)
  var aes_cbc = new aesjs.ModeOfOperation.cbc(key, iv)
  var decrypted_bytes = aes_cbc.decrypt(encrypted_bytes, false)
  var stripped_bytes = aesjs.padding.pkcs7.strip(decrypted_bytes)
  var decrypted_token = arrayBuffer_to_string(stripped_bytes)

  return decrypted_token
}

var base64_to_Uint8Array = function(base64) {
  var bytes_string = unsafeWindow.atob(base64)
  var bytes = new Uint8Array(new ArrayBuffer(bytes_string.length))

  for (var i=0; i < bytes_string.length; i++) {
    bytes[i] = bytes_string.charCodeAt(i)
  }

  return bytes
}

var arrayBuffer_to_string = function(arrayBuffer) {
  return String.fromCharCode.apply(null, new Uint8Array(arrayBuffer))
}

var get_drm_server_url = function(video_url, decrypted_token, request_id) {
  var token_parts = decrypted_token.split('|', 2)
  var license_url, token, index

  if (token_parts.length === 2) {
    license_url = token_parts[0]
    token       = token_parts[1]
  }
  else if (token_parts.length === 1) {
    // decrypted_token contains a URL to the license server that includes querystring parameters.
    // the token is in a querystring parameter (t=<token>).

    index = decrypted_token.indexOf('?')

    if (index > 0) {
      license_url = decrypted_token.substring(0, index)

      token = find_needle({
        haystack: decrypted_token,
        needle:   't=',
        tail:     '&',
        strict:   false
      })
    }
  }

  if (!license_url || !token) return null

  var querystring_parameters = {
    license_url,
    token,
    video_url
  }

  if (request_id) {
    querystring_parameters.request_id = request_id
    querystring_parameters.video_type = 'ondemand'
  }
  else {
    querystring_parameters.video_type = 'simulcast'
  }

  var drm_server_url = user_options.drm.widevine_license_proxy + '?'
                     + Object.keys(querystring_parameters)
                        .map(function(key) {
                          return key + '=' + unsafeWindow.btoa(querystring_parameters[key])
                        })
                        .join('&')

  return drm_server_url
}

// ----------------------------------------------------------------------------- DOM: static skeleton

var reinitialize_dom = function() {
  add_default_trusted_type_policy()

  unsafeWindow.document.close()
  unsafeWindow.document.open()
  unsafeWindow.document.write('')
  unsafeWindow.document.close()

  empty_element(unsafeWindow.document.getElementsByTagName('head')[0])
  empty_element(unsafeWindow.document.body)

  add_style_element(function(){
    return [
      // --------------------------------------------------- reset

      'body {',
      '  margin: 0;',
      '  padding: 0;',
      '  font-family: serif;',
      '  font-size: 16px;',
      '  background-color: #fff !important;',
      '  overflow: auto !important;',
      '}',

      // --------------------------------------------------- declutter

      // hide: "cookie choices" modal overlay
      'body > #cassie-widget {',
      '  display: none !important;',
      '}',

      // --------------------------------------------------- series title

      'body > div > h2 {',
      '  display: block;',
      '  margin: 0;',
      '  padding: 0.5em;',
      '  font-size: 22px;',
      '  text-align: center;',
      '  background-color: #ccc;',
      '}',

      // --------------------------------------------------- series description

      'body > div > div {',
      '  padding: 0.5em;',
      '  font-size: 18px;',
      '}',

      // --------------------------------------------------- list of videos: episodes in series, or individual movie or episode

      'body > div > ul {',
      '  list-style: none;',
      '  margin: 0;',
      '  padding: 0;',
      '  padding-left: 1em;',
      '  padding-bottom: 1em;',
      '}',

      'body > div > ul > li {',
      '  list-style: none;',
      '  margin-top: 0.5em;',
      '  border-top: 1px solid #999;',
      '  padding-top: 0.5em;',
      '}',

      'body > div > ul > li > table td:first-child {',
      '  font-style: italic;',
      '  padding-right: 1em;',
      '}',

      'body > div > ul > li > blockquote {',
      '  display: block;',
      '  background-color: #eee;',
      '  padding: 0.5em 1em;',
      '  margin: 0;',
      '}',

      'body > div > ul > li > div {',
      '  margin: 0.75em 0;',
      '}',

      // --------------------------------------------------- drm

      'body > div > ul > li > div > table {',
      '  width: 100%;',
      '  border-collapse: collapse;',
      '}',

      'body > div > ul > li > div > table tr > td:first-child + td {',
      '  width: 100%;',
      '}',

      'body > div > ul > li > div > table tr > td {',
      '  border-top: 1px solid #999;',
      '  padding: 0.5em 0;',
      '}',

      'body > div > ul > li > div > table tr:first-child > td {',
      '  border-top-style: none;',
      '}',

      'body > div > ul > li > div > table button {',
      '  white-space: nowrap;',
      '}',

      'body > div > ul > li > div > table tr > td:last-child > div.icons-container {',
      '}',

      // --------------------------------------------------- links to tools on Webcast Reloaded website

      'body > div > ul > li div.icons-container {',
      '  display: block;',
      '  position: relative;',
      '  z-index: 1;',
      '  float: right;',
      '  margin: 0.5em;',
      '  width: 60px;',
      '  height: 60px;',
      '  max-height: 60px;',
      '  vertical-align: top;',
      '  background-color: #d7ecf5;',
      '  border: 1px solid #000;',
      '  border-radius: 14px;',
      '}',

      'body > div > ul > li div.icons-container > a.chromecast,',
      'body > div > ul > li div.icons-container > a.chromecast > img,',
      'body > div > ul > li div.icons-container > a.airplay,',
      'body > div > ul > li div.icons-container > a.airplay > img,',
      'body > div > ul > li div.icons-container > a.proxy,',
      'body > div > ul > li div.icons-container > a.proxy > img,',
      'body > div > ul > li div.icons-container > a.video-link,',
      'body > div > ul > li div.icons-container > a.video-link > img {',
      '  display: block;',
      '  width: 25px;',
      '  height: 25px;',
      '}',

      'body > div > ul > li div.icons-container > a.chromecast,',
      'body > div > ul > li div.icons-container > a.airplay,',
      'body > div > ul > li div.icons-container > a.proxy,',
      'body > div > ul > li div.icons-container > a.video-link {',
      '  position: absolute;',
      '  z-index: 1;',
      '  text-decoration: none;',
      '}',

      'body > div > ul > li div.icons-container > a.chromecast,',
      'body > div > ul > li div.icons-container > a.airplay {',
      '  top: 0;',
      '}',
      'body > div > ul > li div.icons-container > a.proxy,',
      'body > div > ul > li div.icons-container > a.video-link {',
      '  bottom: 0;',
      '}',

      'body > div > ul > li div.icons-container > a.chromecast,',
      'body > div > ul > li div.icons-container > a.proxy {',
      '  left: 0;',
      '}',
      'body > div > ul > li div.icons-container > a.airplay,',
      'body > div > ul > li div.icons-container > a.video-link {',
      '  right: 0;',
      '}',
      'body > div > ul > li div.icons-container > a.airplay + a.video-link {',
      '  right: 17px; /* (60 - 25)/2 to center when there is no proxy icon */',
      '}',

      // --------------------------------------------------- live tv channel

      'body > div > ul > li > blockquote + div + div > table.livetv-channel tr {',
      '  vertical-align: top;',
      '}',

      'body > div > ul > li > blockquote + div + div > table.livetv-channel tr > td {',
      '  padding: 0;',
      '}',

      'body > div > ul > li > blockquote + div + div > table.livetv-channel tr > td:first-child {',
      '  white-space: nowrap;',
      '  padding-right: 1em;',
      '}',

      'body > div > ul > li > blockquote + div + div > table.livetv-channel tr > td > h3 {',
      '  padding: 0;',
      '  margin: 0;',
      '}',

      'body > div > ul > li > blockquote + div + div > table.livetv-channel table {',
      '  width: 100%;',
      '}',

      'body > div > ul > li > blockquote + div + div > table.livetv-channel table table tr > td {',
      '  border-style: none;',
      '  padding: 0.25em 0;',
      '}',

      'body > div > ul > li > blockquote + div + div > table.livetv-channel div.livetv-epg-toggle-container {',
      '  transition: height  0.5s linear;',
      '  overflow-y: hidden !important;',
      '  height: auto !important;',
      '}',

      'body > div > ul > li > blockquote + div + div > table.livetv-channel div.livetv-epg-toggle-container.toggle-hide {',
      '  height: 0px !important;',
      '}',

      ''
    ]
  })

  var div, ul, li
  var i

  div = make_element('div')
  ul  = make_element('ul')
  div.appendChild(ul)

  if (state.series.title) {
    div.insertBefore(
      make_element('h2', null, state.series.title),
      ul
    )
  }

  if (state.series.summary) {
    div.insertBefore(
      make_element('div', null, state.series.summary),
      ul
    )
  }

  for (i=0; i < state.episodes.length; i++) {
    li = make_episode_listitem_element(
      state.episodes[i]
    )

    if (li) {
      ul.appendChild(li)

      if (i === state.current_episode_index) {
        li.querySelector(':scope button[' + constants.button_attributes.vod_programme_id + ']').click()
      }
    }
  }

  for (i=0; i < state.livetv_channels.length; i++) {
    li = make_livetv_channel_listitem_element(
      state.livetv_channels[i]
    )

    if (li) {
      ul.appendChild(li)

      if (i === state.current_livetv_channel_index) {
        li.querySelector(':scope button[' + constants.button_attributes.livetv_channel_id + ']').click()
      }
    }
  }

  unsafeWindow.document.body.appendChild(div)
}

// ----------------------------------------------------------------------------- DOM: <li> for episode in show series

var make_episode_listitem_element = function(episode) {
  // const {programme_id, asset_id, season_number, episode_number, title, summary, duration} = episode

  var tr, html, li, div_dynamic

  tr = []
  if (episode.season_number)
    append_tr(tr, [strings.episode_labels.season_number, episode.season_number])
  if (episode.episode_number)
    append_tr(tr, [strings.episode_labels.episode_number, episode.episode_number])
  if (episode.title)
    append_tr(tr, [strings.episode_labels.title, episode.title])
  if (episode.duration)
    append_tr(tr, [strings.episode_labels.duration, episode.duration])
  if (episode.summary)
    append_tr(tr, strings.episode_labels.summary, 2)

  html = [
    '<table>' + tr.join("\n") + '</table>',
    '<blockquote>' + episode.summary + '</blockquote>',
    '<div></div>'
  ]

  li = make_element('li', html.join("\n"))

  div_dynamic = li.querySelector(':scope > div')
  div_dynamic.appendChild(
    make_download_vod_video_button(episode.programme_id, episode.asset_id)
  )

  return li
}

var make_download_vod_video_button = function(programme_id, asset_id) {
  var button = make_element('button')

  button.setAttribute(constants.button_attributes.vod_programme_id, programme_id)
  button.setAttribute(constants.button_attributes.vod_asset_id, asset_id)
  button.textContent = strings.button_download_video
  button.addEventListener("click", onclick_download_vod_video_button)

  return button
}

var onclick_download_vod_video_button = function(event) {
  cancel_event(event)

  var button, div_dynamic, programme_id, asset_id

  button = event.target
  if (!button) return

  div_dynamic = button.parentElement
  if (!div_dynamic) return

  programme_id = button.getAttribute(constants.button_attributes.vod_programme_id)
  asset_id     = button.getAttribute(constants.button_attributes.vod_asset_id)
  if (!programme_id || !asset_id) return

  download_vod_video_sources(programme_id, asset_id, function(video_sources) {
    add_video_sources_to_listitem_element(div_dynamic, video_sources)
  })
}

var add_video_sources_to_listitem_element = function(div_dynamic, video_sources) {
  // video_sources is array of video_data: {video_url, video_type, caption_url, referer_url, drm: {scheme, server, headers}}

  var tr, video_data, video_summary, td_button, td_icons, div_icons, a_icons, a_icon
  var i

  tr = []
  for (i=0; i < video_sources.length; i++) {
    video_data = video_sources[i]

    video_summary  = '<ul>'
    video_summary += '  <li>' + strings.episode_labels.video.format + ' ' + video_data.video_type + '</li>'
    video_summary += '  <li>' + strings.episode_labels.video.drm    + ' ' + (video_data.drm.scheme || 'none') + '</li>'
    video_summary += '</ul>'

    append_tr(tr, ['', video_summary, '']) // col 1: button. col 3: icons.
  }
  empty_element(div_dynamic, '<table>' + tr.join("\n") + '</table>')

  tr = div_dynamic.querySelectorAll(':scope > table tr')

  for (i=0; i < tr.length; i++) {
    video_data = video_sources[i]

    td_button = tr[i].querySelector(':scope > td:first-child')
    td_icons  = tr[i].querySelector(':scope > td:last-child')

    add_start_video_button(/* block_element= */ td_button, video_data)

    if (video_data.drm.scheme) {
      div_icons = make_webcast_reloaded_div(video_data)

      a_icons = {
        real:    {},  // order: chromecast, airplay, [proxy], video-link
        ordered: []
      }

      a_icons.real.airplay    = div_icons.querySelector('a.airplay')
      a_icons.real.direct_hls = div_icons.querySelector('a.video-link')

      a_icon = a_icons.real.direct_hls.cloneNode(/* deep= */ true)
      a_icon.className = 'chromecast'
      a_icons.ordered.push(a_icon)

      a_icon = a_icons.real.direct_hls.cloneNode(/* deep= */ true)
      a_icon.className = 'airplay'
      a_icon.setAttribute('href',  video_data.drm.server)
      a_icon.setAttribute('title', 'direct link to ' + video_data.drm.scheme + ' drm server')
      a_icons.ordered.push(a_icon)

      a_icon = a_icons.real.airplay.cloneNode(/* deep= */ true)
      a_icon.className = 'video-link'
      a_icons.ordered.push(a_icon)

      empty_element(div_icons)

      for (var j=0; j < a_icons.ordered.length; j++) {
        a_icon = a_icons.ordered[j]

        div_icons.appendChild(a_icon)
      }
      a_icons = null

      td_icons.appendChild(div_icons)
    }
    else {
      insert_webcast_reloaded_div(/* block_element= */ td_icons, video_data)
    }
  }
}

var add_start_video_button = function(block_element, video_data) {
  var new_button = make_start_video_button(video_data)

  block_element.appendChild(new_button)
}

var make_start_video_button = function(video_data) {
  var button = make_element('button')

  button.setAttribute(constants.button_attributes.video_url,   video_data.video_url   || '')
  button.setAttribute(constants.button_attributes.video_type,  video_data.video_type  || '')
  button.setAttribute(constants.button_attributes.caption_url, video_data.caption_url || '')
  button.setAttribute(constants.button_attributes.referer_url, video_data.referer_url || '')
  button.setAttribute(constants.button_attributes.drm_scheme,  video_data.drm.scheme  || '')
  button.setAttribute(constants.button_attributes.drm_server,  video_data.drm.server  || '')
  button.textContent = strings.button_start_video
  button.addEventListener("click", onclick_start_video_button)

  return button
}

var onclick_start_video_button = function(event) {
  cancel_event(event)

  var button      = event.target
  var video_url   = button.getAttribute(constants.button_attributes.video_url)
  var video_type  = button.getAttribute(constants.button_attributes.video_type)
  var caption_url = button.getAttribute(constants.button_attributes.caption_url)
  var referer_url = button.getAttribute(constants.button_attributes.referer_url)
  var drm_scheme  = button.getAttribute(constants.button_attributes.drm_scheme)
  var drm_server  = button.getAttribute(constants.button_attributes.drm_server)

  if (video_url)
    process_video_url(video_url, video_type, caption_url, referer_url, drm_scheme, drm_server)
}

// -----------------------------------------------------------------------------

var insert_webcast_reloaded_div = function(block_element, video_data) {
  var webcast_reloaded_div = make_webcast_reloaded_div(video_data)

  block_element.appendChild(webcast_reloaded_div)
}

var make_webcast_reloaded_div = function(video_data) {
  var webcast_reloaded_urls = get_webcast_reloaded_urls(video_data)

  var div = make_element('div')

  var html = [
    '<a target="_blank" class="chromecast" href="' + webcast_reloaded_urls.chromecast_sender   + '" title="Chromecast Sender"><img src="'       + constants.img_urls.base_webcast_reloaded_icons + 'chromecast.png"></a>',
    '<a target="_blank" class="airplay" href="'    + webcast_reloaded_urls.airplay_sender      + '" title="ExoAirPlayer Sender"><img src="'     + constants.img_urls.base_webcast_reloaded_icons + 'airplay.png"></a>',
    '<a target="_blank" class="proxy" href="'      + webcast_reloaded_urls.proxy               + '" title="HLS-Proxy Configuration"><img src="' + constants.img_urls.base_webcast_reloaded_icons + 'proxy.png"></a>',
    '<a target="_blank" class="video-link" href="' + video_data.video_url                      + '" title="direct link to video"><img src="'    + constants.img_urls.base_webcast_reloaded_icons + 'video_link.png"></a>'
  ]

  div.setAttribute('class', 'icons-container')
  div.innerHTML = html.join("\n")

  return div
}

// ----------------------------------------------------------------------------- DOM: <li> for live tv channel

var make_livetv_channel_listitem_element = function(channel) {
  // const {channel_id, epg} = channel

  var tr, epg_html, html, li, div_dynamic, livetv_epg_toggle_button

  tr = []
  if (Array.isArray(channel.epg) && channel.epg.length) {
    for (var i=0; i < channel.epg.length; i++) {
      append_tr(
        tr,
        add_epg_to_livetv_channel_listitem_element(channel.epg[i])
      )
    }
  }

  epg_html = []
  if (tr.length) {
    epg_html = [
      '<div>',
        '<table class="livetv-channel">',
          '<tr>',
            '<td></td>',
            '<td>',
              '<h3>EPG:</h3>',
              '<button class="livetv-epg-toggle-button">' + strings.livetv_epg_toggle_button.show + '</button>',
              '<div class="livetv-epg-toggle-container toggle-hide">',
                '<table class="livetv-epg">',
                  '<tr><td></td></tr>',
                  tr.join("\n"),
                '</table>',
              '</div>',
            '</td>',
          '</tr>',
        '</table>',
      '</div>'
    ]
  }

  html = [
    '<blockquote>' + channel.channel_id + '</blockquote>',
    '<div></div>',
    epg_html.join("\n")
  ]

  li = make_element('li', html.join("\n"))

  epg_html = null
  html = null

  div_dynamic = li.querySelector(':scope > blockquote + div')
  div_dynamic.appendChild(
    make_download_livetv_channel_video_button(channel.channel_id)
  )

  livetv_epg_toggle_button = li.querySelector(':scope button.livetv-epg-toggle-button')
  if (livetv_epg_toggle_button) {
    livetv_epg_toggle_button.addEventListener("click", onclick_livetv_epg_toggle_button)
  }

  return li
}

var add_epg_to_livetv_channel_listitem_element = function(epg) {
  // const {series_title, season_number, episode_number, episode_title_1, episode_title_2, episode_summary, duration_date_range, duration} = epg

  var tr = []
  if (epg.duration_date_range)
    append_tr(tr, [strings.livetv_channel_labels.epg.duration_date_range, epg.duration_date_range])
  if (epg.duration)
    append_tr(tr, [strings.livetv_channel_labels.epg.duration, epg.duration])
  if (epg.season_number)
    append_tr(tr, [strings.livetv_channel_labels.epg.season_number, epg.season_number])
  if (epg.episode_number)
    append_tr(tr, [strings.livetv_channel_labels.epg.episode_number, epg.episode_number])
  if (epg.series_title)
    append_tr(tr, [strings.livetv_channel_labels.epg.series_title, epg.series_title])
  if (epg.episode_title_1)
    append_tr(tr, [strings.livetv_channel_labels.epg.episode_title_1, epg.episode_title_1])
  if (epg.episode_title_2)
    append_tr(tr, [strings.livetv_channel_labels.epg.episode_title_2, epg.episode_title_2])
  if (epg.episode_summary)
    append_tr(tr, [strings.livetv_channel_labels.epg.episode_summary, epg.episode_summary])

  return '<table>' + tr.join("\n") + '</table>'
}

var onclick_livetv_epg_toggle_button = function(event) {
  cancel_event(event)

  var className = 'toggle-hide'
  var button, div_dynamic

  button = event.target
  if (!button) return

  div_dynamic = button.nextElementSibling
  if (!div_dynamic || !div_dynamic.classList.contains('livetv-epg-toggle-container')) return

  if (div_dynamic.classList.contains(className)) {
    // toggle: hide => show
    div_dynamic.classList.remove(className)
    button.textContent = strings.livetv_epg_toggle_button.hide
  }
  else {
    // toggle: show => hide
    div_dynamic.classList.add(className)
    button.textContent = strings.livetv_epg_toggle_button.show
  }
}

var make_download_livetv_channel_video_button = function(channel_id) {
  var button = make_element('button')

  button.setAttribute(constants.button_attributes.livetv_channel_id, channel_id)
  button.textContent = strings.button_download_video
  button.addEventListener("click", onclick_download_livetv_channel_video_button)

  return button
}

var onclick_download_livetv_channel_video_button = function(event) {
  cancel_event(event)

  var button, div_dynamic, channel_id

  button = event.target
  if (!button) return

  div_dynamic = button.parentElement
  if (!div_dynamic) return

  channel_id = button.getAttribute(constants.button_attributes.livetv_channel_id)
  if (!channel_id) return

  download_livetv_channel_video_sources(channel_id, function(video_sources) {
    add_video_sources_to_listitem_element(div_dynamic, video_sources)
  })
}

// ----------------------------------------------------------------------------- bootstrap: live tv

var page_init_livetv = function(path) {
  var channelId = (path.length >= 3) ? path[2] : null

  debug('channelId: ' + channelId)

  download_livetv_data(function(livetv_data) {
    process_livetv_guide(livetv_data, channelId, reinitialize_dom)
  })
}

// ----------------------------------------------------------------------------- bootstrap: shows

var page_init_shows = function(path) {
  var seriesId  =  (path.length >= 3) ? path[2] : null
  var episodeId = ((path.length >= 5) && (path[3] === 'on-demand')) ? path[4] : null

  debug('seriesId: '  + seriesId)
  debug('episodeId: ' + episodeId)

  if (!seriesId) return

  var dom_data = scrape_dom_data()
  if (!dom_data || (typeof dom_data !== 'object')) return

  process_series_media_items(dom_data, seriesId, episodeId, reinitialize_dom)
}

// ----------------------------------------------------------------------------- bootstrap

var page_init = function() {
  debug('initializing..', true)

  if (!aesjs) return

  var path = unsafeWindow.location.pathname
  if ((path.length < 2) || (path[0] !== '/')) return
  path = path.split('/')
  if (path.length < 2) return

  download_decryption_parameters(function() {
    if (!state.decryption_parameters.key || !state.decryption_parameters.iv) return

    if (path[1] === 'now') {
      page_init_livetv(path)
    }
    if (path[1] === 'programmes') {
      page_init_shows(path)
    }
  })
}

if (user_options.common.init_delay_ms)
  unsafeWindow.setTimeout(page_init, user_options.common.init_delay_ms)
else
  page_init()
