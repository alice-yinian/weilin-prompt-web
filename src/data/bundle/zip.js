// 读取数据包 zip（`import_weilin_db.py --include-images` 的产物：data.json + images/*）
// 只依赖浏览器原生 DecompressionStream，不引入 zip 库；不支持时给出明确提示。

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50

function findEndOfCentralDirectory(view) {
  const maxBack = Math.min(view.byteLength, 66_000)
  for (let offset = view.byteLength - 22; offset >= view.byteLength - maxBack; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset
  }
  return -1
}

function readEntries(buffer) {
  const view = new DataView(buffer)
  const eocd = findEndOfCentralDirectory(view)
  if (eocd < 0) throw new Error('不是有效的 zip 文件')

  const count = view.getUint16(eocd + 10, true)
  let pointer = view.getUint32(eocd + 16, true)
  const entries = []

  for (let index = 0; index < count; index++) {
    if (view.getUint32(pointer, true) !== CENTRAL_SIGNATURE) throw new Error('zip 中央目录已损坏')
    const method = view.getUint16(pointer + 10, true)
    const compressedSize = view.getUint32(pointer + 20, true)
    const uncompressedSize = view.getUint32(pointer + 24, true)
    const nameLength = view.getUint16(pointer + 28, true)
    const extraLength = view.getUint16(pointer + 30, true)
    const commentLength = view.getUint16(pointer + 32, true)
    const localOffset = view.getUint32(pointer + 42, true)
    const name = new TextDecoder().decode(new Uint8Array(buffer, pointer + 46, nameLength))

    entries.push({ name, method, compressedSize, uncompressedSize, localOffset })
    pointer += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

async function readEntryBuffer(buffer, entry) {
  const view = new DataView(buffer)
  if (view.getUint32(entry.localOffset, true) !== LOCAL_SIGNATURE) throw new Error('zip 条目已损坏')
  const nameLength = view.getUint16(entry.localOffset + 26, true)
  const extraLength = view.getUint16(entry.localOffset + 28, true)
  const start = entry.localOffset + 30 + nameLength + extraLength
  const raw = new Uint8Array(buffer, start, entry.compressedSize)

  if (entry.method === 0) return raw

  if (entry.method !== 8) throw new Error(`不支持的压缩方式: ${entry.method}`)
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前浏览器不支持解压 zip（缺少 DecompressionStream），请解压后导入其中的 data.json')
  }

  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function readBundleZip(file) {
  const buffer = await file.arrayBuffer()
  const entries = readEntries(buffer)
  const dataEntry = entries.find((entry) => entry.name === 'data.json' || entry.name.endsWith('/data.json'))
  if (!dataEntry) throw new Error('zip 中缺少 data.json')

  const dataBytes = await readEntryBuffer(buffer, dataEntry)
  const bundle = JSON.parse(new TextDecoder().decode(dataBytes))

  const images = {}
  for (const entry of entries) {
    if (entry.name === dataEntry.name) continue
    if (entry.name.endsWith('/')) continue
    const bytes = await readEntryBuffer(buffer, entry)
    images[entry.name] = new Blob([bytes])
  }
  bundle.images = images
  return bundle
}
