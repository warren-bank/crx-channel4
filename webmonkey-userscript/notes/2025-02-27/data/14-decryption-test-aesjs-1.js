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

getVODBSMessage(
  /* key= */   "n9cLieYkqwzNCqvi",
  /* iv=  */   "odzcU3WdUiXLucVd",
  /* token= */ "N7gcqe+YqA2R/w4/7MirY2EPVnn9KMt7pp/tAPBCeOxPTBgnuAAKao4vYCwg6+/iesCJyiJzl9p/HftP/8PfQMCuXuRDRdVtjQY7c1et4Qxb9OtecXg4oL+eCY0Gqza7ut3FoiTbqlw2bVVAJeY1/CxBBXRbIAM6JnG4RBmcRJgIEIQD9P7rfp5tttM6SdcEpj2wdBACEVXMeGRneoSPDYV51v6yAxrhGccVRaL7pkqE+bij5jV0Aa4eE4nRVjcxfJy4yh6nAhl8TKVM0E58HIW+ekEwjpuiXNC+WXx0V7pp9C/rPsJvKqKFIHhL89J5",
  /* video_profile_name= */ video_profile_names.WIDEVINE
)
