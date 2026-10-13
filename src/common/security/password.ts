import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

// argon2id with the OWASP minimum recommended parameters (19 MiB memory, 2 passes, 1 lane),
// implemented by Node's built-in crypto (Node >= 24.7). Stored in PHC string format.
const PARAMS = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 } as const;

function argon2id(
  password: string,
  salt: Buffer,
  p: { memory: number; passes: number; parallelism: number; tagLength: number },
) {
  return new Promise<Buffer>((resolve, reject) => {
    argon2('argon2id', { message: password, nonce: salt, ...p }, (err, key) =>
      err ? reject(err) : resolve(Buffer.from(key)),
    );
  });
}

const b64 = (buf: Buffer) => buf.toString('base64').replace(/=+$/, '');

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await argon2id(password, salt, PARAMS);
  return `$argon2id$v=19$m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}$${b64(salt)}$${b64(hash)}`;
}

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = PHC.exec(stored);
  if (!match) return false;
  const [, m, t, p, saltB64, hashB64] = match;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await argon2id(password, Buffer.from(saltB64, 'base64'), {
    memory: Number(m),
    passes: Number(t),
    parallelism: Number(p),
    tagLength: expected.length,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A fixed hash used to keep login timing similar when the email does not exist. */
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}
