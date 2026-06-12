const EXTERNAL_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateMenuExternalId(prefix = 'MI') {
  const bytes = new Uint8Array(10)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }

  const code = Array.from(bytes, byte => EXTERNAL_ID_ALPHABET[byte % EXTERNAL_ID_ALPHABET.length]).join('')
  return `${prefix}-${code}`
}
