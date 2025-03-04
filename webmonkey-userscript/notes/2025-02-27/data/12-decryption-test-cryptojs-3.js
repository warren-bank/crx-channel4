{
  // load "CryptoJS"
  var s = document.createElement('script')
  s.setAttribute('src', 'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js')
  document.body.appendChild(s)
}

{
  const token = "N7gcqe+YqA2R/w4/7MirY2EPVnn9KMt7pp/tAPBCeOxPTBgnuAAKao4vYCwg6+/iesCJyiJzl9p/HftP/8PfQMCuXuRDRdVtjQY7c1et4Qxb9OtecXg4oL+eCY0Gqza7ut3FoiTbqlw2bVVAJeY1/CxBBXRbIAM6JnG4RBmcRJgIEIQD9P7rfp5tttM6SdcEpj2wdBACEVXMeGRneoSPDYV51v6yAxrhGccVRaL7pkqE+bij5jV0Aa4eE4nRVjcxfJy4yh6nAhl8TKVM0E58HIW+ekEwjpuiXNC+WXx0V7pp9C/rPsJvKqKFIHhL89J5"

  const key = CryptoJS.enc.Base64.parse("n9cLieYkqwzNCqvi")
  const iv  = CryptoJS.enc.Base64.parse("odzcU3WdUiXLucVd")
  const aesDecryptor = CryptoJS.algo.AES.createDecryptor(key, { iv: iv })

  console.log(
    aesDecryptor.process(token).toString(CryptoJS.enc.Utf8)
  )
}
