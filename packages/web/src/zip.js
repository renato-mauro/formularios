// Zip mínimo, sem dependências: grava (deflate quando compensa) e lê store/deflate.
// Usa CompressionStream/DecompressionStream('deflate-raw'): navegador e Node.

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const EOCD = 0x06054b50;
const UTF8 = 0x0800;

const encoder = new TextEncoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// [{ name, data: string | Uint8Array }] -> Uint8Array
export async function zip(files, date = new Date()) {
  const { time, day } = dosDate(date);
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const deflated = await through(data, new CompressionStream('deflate-raw'));
    const method = deflated.length < data.length ? 8 : 0;
    const body = method === 8 ? deflated : data;
    const crc = crc32(data);

    const local = writer(30 + name.length);
    local.u32(LOCAL).u16(20).u16(UTF8).u16(method).u16(time).u16(day)
      .u32(crc).u32(body.length).u32(data.length).u16(name.length).u16(0).bytes(name);
    parts.push(local.buf, body);

    const entry = writer(46 + name.length);
    entry.u32(CENTRAL).u16(20).u16(20).u16(UTF8).u16(method).u16(time).u16(day)
      .u32(crc).u32(body.length).u32(data.length).u16(name.length).u16(0).u16(0)
      .u16(0).u16(0).u32(0).u32(offset).bytes(name);
    central.push(entry.buf);
    offset += local.buf.length + body.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = writer(22);
  end.u32(EOCD).u16(0).u16(0).u16(files.length).u16(files.length).u32(size).u32(offset).u16(0);
  return concat([...parts, ...central, end.buf]);
}

// Uint8Array | ArrayBuffer -> [{ name, data: Uint8Array }]; pastas ficam de fora.
export async function unzip(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const end = findEnd(view);
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== CENTRAL) throw new Error('zip inválido (diretório central corrompido)');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const skip = nameLength + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    p += 46 + skip;
    if (name.endsWith('/')) continue;
    if (view.getUint32(local, true) !== LOCAL) throw new Error(`zip inválido (${name})`);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    if (method === 0) entries.push({ name, data: raw });
    else if (method === 8) entries.push({ name, data: await through(raw, new DecompressionStream('deflate-raw')) });
    else throw new Error(`zip: método de compressão ${method} não suportado (${name})`);
  }
  return entries;
}

function findEnd(view) {
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD) return i;
  }
  throw new Error('o arquivo não é um zip');
}

async function through(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

function writer(size) {
  const buf = new Uint8Array(size);
  const view = new DataView(buf.buffer);
  let p = 0;
  const w = {
    buf,
    u16(v) { view.setUint16(p, v, true); p += 2; return w; },
    u32(v) { view.setUint32(p, v >>> 0, true); p += 4; return w; },
    bytes(b) { buf.set(b, p); p += b.length; return w; },
  };
  return w;
}

function concat(chunks) {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

function dosDate(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    day: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}
