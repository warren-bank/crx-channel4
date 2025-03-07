### [channel4](https://github.com/warren-bank/crx-channel4/tree/webmonkey-userscript/es5)

[Userscript](https://github.com/warren-bank/crx-channel4/raw/webmonkey-userscript/es5/webmonkey-userscript/channel4.user.js) for [channel4.com](https://www.channel4.com/) to run in:
* the [WebMonkey](https://github.com/warren-bank/Android-WebMonkey) application
  - for Android
* the [Tampermonkey](https://www.tampermonkey.net/) web browser extension
  - for [Firefox/Fenix](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
  - for [Chrome/Chromium](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
* the [Violentmonkey](https://violentmonkey.github.io/) web browser extension
  - for [Firefox/Fenix](https://addons.mozilla.org/firefox/addon/violentmonkey/)
  - for [Chrome/Chromium](https://chrome.google.com/webstore/detail/violent-monkey/jinjaccalgkegednnccohejagnlnfdag)

Its purpose is to:
* for on-demand video content&hellip; both series and films:
  - replace the page's content with a list of all available episodes in the series
    * where a film is treated as a series having a single episode
  - for each available episode, display:
    * season #
    * episode #
    * title
    * summary
    * duration
    * _Get Video URL_ button to obtain the URL for its video
  - after this button is clicked, display:
    * a list of all available video formats
  - for each available video format, display:
    * a brief summary of its attributes
    * _Start Media_ button to transfer the chosen media to an external player
    * a grouping of icons to transfer the chosen media to various pages on the [Webcast-Reloaded](https://github.com/warren-bank/crx-webcast-reloaded) external [website](https://warren-bank.github.io/crx-webcast-reloaded/external_website/index.html)
      - each of these pages provide tight integration with tools for media streams:
        * _Google Chromecast_
        * [_ExoAirPlayer_](https://github.com/warren-bank/Android-ExoPlayer-AirPlay-Receiver)
        * [_HLS-Proxy_](https://github.com/warren-bank/HLS-Proxy)
* for live tv channels:
  - replace the page's content with a list of all available live tv channels
  - for each available live tv channel, display:
    * title
    * _EPG_ toggle button to hide or show a list of upcoming programs on this channel:
      - time: start - finish
      - duration
      - series title
      - season #
      - episode #
      - episode title
      - summary
    * _Get Video URL_ button to obtain the URL for its video

#### Notes:

* to access the data API endoint and video stream hosts:
  - a geo-fence requires that requests originate from an IP within the UK
  - login is _not_ required
  - _Referer_ request header is _not_ required

#### Important:

* on the _channel4_ website..
  - the video player obtains its DRM license from a Widevine license proxy server
  - the format of the data sent from the video player to the Widevine license proxy server is non-standard
* standard video players cannot be configured to directly communicate with this Widevine license proxy server
* in order to allow standard video players to acquire a Widevine license from this non-standard server:
  - I wrote my own [Widevine license proxy server](https://github.com/warren-bank/node-widevine-license-proxy)
  - its design is extensible..
    * so a plugin can be easily written for each unique license server configuration;<br>which is to say.. for each license server having a unique input/output data format
  - the purpose for each plugin is:
    * to map request input from a standard format to a non-standard format
    * to map response output from a non-standard format to a standard format
    * to handle requests for both certificates and licenses
  - a [plugin for _channel4_](https://github.com/warren-bank/node-widevine-license-proxy/tree/master/.recipes/02.%20channel4) is included
    * as a "recipe" in the _github_ repo, but not [_npm_](https://www.npmjs.com/package/@warren-bank/widevine-license-proxy)
* this userscript needs to be configured with the URL for an instance of this proxy server
  - the default is: `http://localhost:8080/channel4`

#### Credits:

* [c4-dl](https://github.com/Diazole/c4-dl) by [Sean Godsell](https://github.com/Diazole) is an _excellent_ Python script<br>that provides the methodology needed to make this project possible
  - huge thanks!

#### Legal:

* copyright: [Warren Bank](https://github.com/warren-bank)
* license: [GPL-2.0](https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt)
