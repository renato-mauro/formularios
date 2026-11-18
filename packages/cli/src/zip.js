// Leitor mínimo de .zip (sem dependências): métodos 0 (store) e 8 (deflate).
// Basta para o zip de projeto da interface web e para zips feitos pelo sistema.
import { inflateRawSync } from 'node:zlib';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

// Buffer -> [{ name, data: Buffer }]; pastas ficam de fora.
export function unzip(buf) {
  const end = findEnd(buf);
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CENTRAL) throw new Error('zip inválido (diretório central corrompido)');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLength = buf.readUInt16LE(p + 28);
    const skip = nameLength + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLength);
    p += 46 + skip;
    if (name.endsWith('/')) continue;
    if (buf.readUInt32LE(local) !== LOCAL) throw new Error(`zip inválido (${name})`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (method === 0) entries.push({ name, data: raw });
    else if (method === 8) entries.push({ name, data: inflateRawSync(raw) });
    else throw new Error(`zip: método de compressão ${method} não suportado (${name})`);
  }
  return entries;
}

function findEnd(buf) {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD) return i;
  }
  throw new Error('o arquivo não é um zip');
}
