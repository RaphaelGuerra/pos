// Lightweight passphrase-based AES-GCM encryption for JSON payloads.
// Uses Web Crypto API (SubtleCrypto) available in modern browsers.

const ITERATIONS = 100_000
const SALT_BYTES = 16
const IV_BYTES = 12

function getCrypto() {
  if (typeof crypto !== 'undefined' && crypto.subtle) return crypto
  throw new Error('Web Crypto not available')
}

function utf8Encode(str) { return new TextEncoder().encode(str) }
function utf8Decode(buf) { return new TextDecoder().decode(buf) }

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  return btoa(binary)
}
function base64ToBuf(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

async function deriveKey(passphrase, saltBytes, iterations = ITERATIONS) {
  const c = getCrypto()
  const keyMaterial = await c.subtle.importKey('raw', utf8Encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return c.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export function isEncryptedEnvelope(obj) { return !!(obj && typeof obj === 'object' && obj._enc === 1 && obj.alg === 'AES-GCM') }

export async function encryptJSON(obj, passphrase) {
  if (!passphrase) throw new Error('Passphrase required')
  const c = getCrypto()
  const salt = new Uint8Array(SALT_BYTES); c.getRandomValues(salt)
  const iv = new Uint8Array(IV_BYTES); c.getRandomValues(iv)
  const key = await deriveKey(passphrase, salt)
  const plaintext = utf8Encode(JSON.stringify(obj))
  const ctBuf = await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return { _enc: 1, alg: 'AES-GCM', kdf: 'PBKDF2', iter: ITERATIONS, salt: bufToBase64(salt.buffer), iv: bufToBase64(iv.buffer), ct: bufToBase64(ctBuf) }
}

export async function decryptJSON(envelope, passphrase) {
  if (!isEncryptedEnvelope(envelope)) throw new Error('Invalid envelope')
  if (!passphrase) throw new Error('Passphrase required')
  const c = getCrypto()
  const salt = new Uint8Array(base64ToBuf(envelope.salt))
  const iv = new Uint8Array(base64ToBuf(envelope.iv))
  const ct = base64ToBuf(envelope.ct)
  const iterations = typeof envelope.iter === 'number' ? envelope.iter : ITERATIONS
  const key = await deriveKey(passphrase, salt, iterations)
  const ptBuf = await c.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  const text = utf8Decode(ptBuf)
  return JSON.parse(text)
}

