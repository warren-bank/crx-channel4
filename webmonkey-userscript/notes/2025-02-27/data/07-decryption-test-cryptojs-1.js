{
  // load "CryptoJS"
  var s = document.createElement('script')
  s.setAttribute('src', 'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js')
  document.body.appendChild(s)
}

// https://cryptojs.gitbook.io/docs#ciphers
const decryptPkcs7 = function(encryptedData, key) {
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedData, key, {
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
  }
  catch (error) {
    console.error("Decryption error:", error);
    return null;
  }
}

const decryptToken = (token) => {
  const key = "\x41\x59\x44\x49\x44\x38\x53\x44\x46\x42\x50\x34\x4d\x38\x44\x48"
  const decodedToken = atob(token)
  return decryptPkcs7(decodedToken, key)
}

const decryptStreams = (id) => {
  fetch(`https://www.channel4.com/vod/stream/${id}`)
    .then(res => res.json())
    .then(
      data => data.videoProfiles
        .map(
          profile => profile.streams
            .map(
              stream => ({uri: stream.uri, token: decryptToken(stream.token)})
            )
        )
        .reduce((all, some) => [...all, ...some], [])
    )
    .then(streams => {
      console.log(JSON.stringify(streams, null, 2))
    })
}

decryptStreams('77468-001')
