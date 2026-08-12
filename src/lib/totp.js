const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Decode(str) {
  const cleaned = String(str).toUpperCase().replace(/[=\s]/g, '')
  let bits = 0
  let value = 0
  const out = []
  for (const ch of cleaned) {
    const idx = B32_ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error('Clé base32 invalide')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

function base32Encode(bytes) {
  let bits = 0
  let value = 0
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i]
    bits += 8
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function randomBytes(n) {
  const arr = new Uint8Array(n)
  if (crypto && crypto.getRandomValues) crypto.getRandomValues(arr)
  else for (let i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256)
  return arr
}

function sha1Bytes(bytes) {
  const l = bytes.length
  const msg = new Uint8Array((Math.floor((l + 8) / 64) + 1) * 64)
  msg.set(bytes)
  msg[l] = 0x80
  const dv = new DataView(msg.buffer)
  dv.setUint32(msg.length - 4, l * 8, false)
  let h0 = 0x67452301 | 0
  let h1 = 0xefcdab89 | 0
  let h2 = 0x98badcfe | 0
  let h3 = 0x10325476 | 0
  let h4 = 0xc3d2e1f0 | 0
  const w = new Int32Array(80)
  const n = msg.length / 64
  for (let b = 0; b < n; b++) {
    const off = b * 64
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4, false)
    for (let i = 16; i < 80; i++) {
      w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]) | 0
      w[i] = ((w[i] << 1) | (w[i] >>> 31)) | 0
    }
    let a = h0
    let b2 = h1
    let c = h2
    let d = h3
    let e = h4
    for (let i = 0; i < 80; i++) {
      let f
      let k
      if (i < 20) {
        f = (b2 & c) | (~b2 & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b2 ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b2 & c) | (b2 & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b2 ^ c ^ d
        k = 0xca62c1d6
      }
      const t = ((((a << 5) | (a >>> 27)) | 0) + f + e + k + w[i]) | 0
      e = d
      d = c
      c = ((b2 << 30) | (b2 >>> 2)) | 0
      b2 = a
      a = t
    }
    h0 = (h0 + a) | 0
    h1 = (h1 + b2) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
  }
  const out = new Uint8Array(20)
  const odv = new DataView(out.buffer)
  odv.setUint32(0, h0 >>> 0, false)
  odv.setUint32(4, h1 >>> 0, false)
  odv.setUint32(8, h2 >>> 0, false)
  odv.setUint32(12, h3 >>> 0, false)
  odv.setUint32(16, h4 >>> 0, false)
  return out
}

function hmacSha1(keyBytes, msgBytes) {
  const blockSize = 64
  const keyFinal = keyBytes.length > blockSize ? sha1Bytes(keyBytes) : keyBytes
  const key = new Uint8Array(blockSize)
  key.set(keyFinal, 0)
  const inner = new Uint8Array(blockSize + msgBytes.length)
  const outer = new Uint8Array(blockSize + 20)
  for (let i = 0; i < blockSize; i++) {
    inner[i] = key[i] ^ 0x36
    outer[i] = key[i] ^ 0x5c
  }
  inner.set(msgBytes, blockSize)
  outer.set(sha1Bytes(inner), blockSize)
  return sha1Bytes(outer)
}

export function genererSecretTotp() {
  return base32Encode(randomBytes(16))
}

export async function genererCodeTotp(secret, compteur) {
  const key = base32Decode(secret)
  const ctr = compteur == null ? Math.floor(Date.now() / 1000 / 30) : compteur
  const msg = new Uint8Array(8)
  const dv = new DataView(msg.buffer)
  dv.setUint32(0, Math.floor(ctr / 0x100000000), false)
  dv.setUint32(4, ctr >>> 0, false)
  const hmac = hmacSha1(key, msg)
  const offset = hmac[hmac.length - 1] & 0x0f
  const binCode = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
  return String(binCode % 1000000).padStart(6, '0')
}

export async function verifierCodeTotp(secret, code) {
  if (!/^\d{6}$/.test(String(code))) return false
  const ctr = Math.floor(Date.now() / 1000 / 30)
  for (let delta = -1; delta <= 1; delta++) {
    const gen = await genererCodeTotp(secret, ctr + delta)
    if (gen === String(code)) return true
  }
  return false
}

export function uriTotp(secret, compte) {
  const label = encodeURIComponent('Tontine Manager') + ':' + encodeURIComponent(compte || 'mon-appareil')
  return 'otpauth://totp/' + label + '?secret=' + secret + '&issuer=Tontine%20Manager&algorithm=SHA1&digits=6&period=30'
}
