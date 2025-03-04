{
  // load "CryptoJS"
  var s = document.createElement('script')
  s.setAttribute('src', 'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js')
  document.body.appendChild(s)
}

// https://cryptojs.gitbook.io/docs#ciphers
// https://cryptojs.gitbook.io/docs#custom-key-and-iv
const decryptPkcs7 = function(encryptedData, key, iv) {
  try {
    key = CryptoJS.enc.Base64.parse(key);
    iv  = CryptoJS.enc.Base64.parse(iv);

    const decrypted = CryptoJS.AES.decrypt(encryptedData, key, {
      iv: iv,
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
  const key = "n9cLieYkqwzNCqvi"
  const iv  = "odzcU3WdUiXLucVd"
  const decodedToken = atob(token)
  return decryptPkcs7(decodedToken, key, iv)
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
