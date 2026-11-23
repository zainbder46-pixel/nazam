import crypto from "crypto";

// Web Push بدون مكتبات: تشفير aes128gcm (RFC 8291) + توقيع VAPID (RFC 8292)

export type PushSub = { endpoint: string; p256dh: string; auth: string };

const b64u = (b: Buffer) => b.toString("base64url");
const unb64u = (s: string) => Buffer.from(s, "base64url");
const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, len: number) =>
  Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, len));

export function encryptPayload(payload: Buffer, p256dh: string, authSecret: string, salt = crypto.randomBytes(16), ecdh?: crypto.ECDH) {
  const uaPub = unb64u(p256dh);
  const auth = unb64u(authSecret);
  const local = ecdh ?? crypto.createECDH("prime256v1");
  if (!ecdh) local.generateKeys();
  const asPub = local.getPublicKey();
  const shared = local.computeSecret(uaPub);

  const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub]), 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const enc = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPub.length, 20);
  return Buffer.concat([header, asPub, enc]);
}

export function vapidAuth(endpoint: string, publicKey: string, privateKey: string, subject: string) {
  const pub = unb64u(publicKey);
  const key = crypto.createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: "jwk",
  });
  const head = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 3000, sub: subject })));
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${publicKey}`;
}

export async function sendPush(sub: PushSub, data: object, vapid: { publicKey: string; privateKey: string; subject: string }) {
  const body = encryptPayload(Buffer.from(JSON.stringify(data)), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      TTL: "3600",
      Urgency: "high",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      Authorization: vapidAuth(sub.endpoint, vapid.publicKey, vapid.privateKey, vapid.subject),
    },
    body: new Uint8Array(body),
  });
  return res.status;
}
