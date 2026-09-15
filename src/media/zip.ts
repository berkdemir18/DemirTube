// DemirTube · bağımlılıksız ZIP okuyucu
//
// Trakt dışa aktarımı tek bir ZIP. Yalnızca okunuyor, yalnızca "stored" ve
// "deflate" yöntemleri gerekiyor; ikisi de tarayıcının kendi
// DecompressionStream'iyle açılıyor. Bunun için kütüphane eklemek, eklentiye
// yüz kilobaytlar katmak olurdu.

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
/** Açılmış toplam boyut üst sınırı: bozuk ya da kötü niyetli dosya belleği doldurmasın. */
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZip(buffer: ArrayBuffer, accept: (name: string) => boolean = () => true): Promise<ZipEntry[]> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  // Dosya sonu kaydı en fazla 65535 baytlık yorumla birlikte sondadır.
  let eocd = -1;
  for (let offset = buffer.byteLength - 22; offset >= Math.max(0, buffer.byteLength - 22 - 65_535); offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("Bu bir ZIP dosyası değil ya da dosya yarım inmiş.");

  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let total = 0;

  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) throw new Error("ZIP içindekiler listesi bozuk.");
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/") || !accept(name)) continue;
    total += size;
    if (total > MAX_TOTAL_BYTES) throw new Error("ZIP beklenenden çok büyük.");
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) throw new Error(`ZIP'te "${name}" okunamadı.`);
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) entries.push({ name, bytes: data });
    else if (method === 8) entries.push({ name, bytes: await inflateRaw(data) });
    else throw new Error(`ZIP'te desteklenmeyen sıkıştırma (${method}).`);
  }
  return entries;
}
