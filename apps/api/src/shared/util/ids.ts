import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export type IdPrefix =
  | 'ord' | 'res' | 'btx' | 'ptx' | 'doc' | 'inv' | 'rfd' | 'mer' | 'prv' | 'csm' | 'adm'
  | 'evt' | 'chs' | 'otp' | 'lnk' | 'ida' | 'inq' | 'iqr' | 'rfl' | 'pln' | 'jnl' | 'lln'
  | 'rec' | 'rol' | 'ses' | 'fil' | 'aud' | 'msg' | 'tpl' | 'whe' | 'key' | 'gtw' | 'stc'
  | 'psl' | 'pvs' | 'pcl' | 'exp' | 'alr' | 'oev';

let lastTime = 0;
let lastRandom: number[] = [];

/** ULID (monotonic within a millisecond) with a type prefix, e.g. `ord_01J…`. */
export function newId(prefix: IdPrefix): string {
  let now = Date.now();
  let rand: number[];
  if (now <= lastTime) {
    now = lastTime;
    rand = [...lastRandom];
    for (let i = rand.length - 1; i >= 0; i--) {
      if (rand[i] < 31) {
        rand[i]++;
        break;
      }
      rand[i] = 0;
    }
  } else {
    const bytes = randomBytes(16);
    rand = Array.from({ length: 16 }, (_, i) => bytes[i] % 32);
  }
  lastTime = now;
  lastRandom = rand;
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  return `${prefix}_${time}${rand.map((r) => ALPHABET[r]).join('')}`;
}
