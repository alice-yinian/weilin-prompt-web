// 数据包 zip 的读写。
//
// 读：`import_weilin_db.py --include-images` 的产物（data.json + images/*），
//     只依赖浏览器原生 DecompressionStream，不引入第三方库。
// 写：`writeBundleZip()` 用 store 方法（method 0，不压缩）自己拼 local header +
//     central directory + EOCD，需要 CRC32；同样不依赖任何库。

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50

// ZIP 固定字段：通用位标记 bit 11 = 文件名 UTF-8；DOS 时间戳取 1980-01-01（写死保证可复现）
const VERSION_NEEDED = 20
const FLAG_UTF8 = 0x0800
const METHOD_STORE = 0
const DOS_TIME = 0
const DOS_DATE = 0x21

const TAG_IMAGES_DIR = 'images/tag_images/'
const TAG_THUMBS_DIR = 'images/tag_thumbs/'

const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif'
}

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif'
}

function extToMime(ext) {
  return MIME_BY_EXT[String(ext || '').toLowerCase()] || ''
}

function mimeToExt(mime) {
  return EXT_BY_MIME[String(mime || '').toLowerCase()] || 'bin'
}

function findEndOfCentralDirectory(view) {
  if (view.byteLength < 22) return -1
  const maxBack = Math.min(view.byteLength, 66_000)
  for (
    let offset = view.byteLength - 22;
    offset >= 0 && offset >= view.byteLength - maxBack;
    offset--
  ) {
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

  if (entry.method === METHOD_STORE) return raw

  if (entry.method !== 8) throw new Error(`不支持的压缩方式: ${entry.method}`)
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前浏览器不支持解压 zip（缺少 DecompressionStream），请解压后导入其中的 data.json')
  }

  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** 从 `images/tag_images/<uuid>.<ext>` 之类的条目名里拆出 uuid 与扩展名 */
function splitTagImageName(name, dir) {
  const rest = name.slice(dir.length)
  if (!rest || rest.includes('/')) return null
  const dot = rest.lastIndexOf('.')
  const uuid = dot > 0 ? rest.slice(0, dot) : rest
  const ext = dot > 0 ? rest.slice(dot + 1) : ''
  if (!uuid) return null
  return { uuid, ext }
}

/**
 * 读取数据包 zip。
 *
 * `images/tag_images/<t_uuid>.<ext>` → `data.blobs` 项 `{key:'tag:<t_uuid>', blob, mime}`；
 * `images/tag_thumbs/*` 是可选缩略图，仅当同 uuid 没有原图时才作为兜底。
 * 其它条目（报告、未知目录）忽略。返回的 bundle 不再带 `images` 字段。
 *
 * @param {File|Blob} file
 * @returns {Promise<object>} 数据包对象
 */
export async function readBundleZip(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('readBundleZip 需要一个 File/Blob 入参')
  }
  const buffer = await file.arrayBuffer()
  const entries = readEntries(buffer)
  const dataEntry = entries.find(
    (entry) => entry.name === 'data.json' || entry.name.endsWith('/data.json')
  )
  if (!dataEntry) throw new Error('zip 中缺少 data.json')

  const dataBytes = await readEntryBuffer(buffer, dataEntry)
  const bundle = JSON.parse(new TextDecoder().decode(dataBytes))

  const metaByKey = new Map()
  if (Array.isArray(bundle?.data?.blobs)) {
    for (const item of bundle.data.blobs) {
      if (item && typeof item.key === 'string') metaByKey.set(item.key, item)
    }
  }

  const originals = new Map()
  const thumbs = new Map()
  for (const entry of entries) {
    if (entry === dataEntry || entry.name.endsWith('/')) continue
    const isOriginal = entry.name.startsWith(TAG_IMAGES_DIR)
    const isThumb = !isOriginal && entry.name.startsWith(TAG_THUMBS_DIR)
    if (!isOriginal && !isThumb) continue

    const parsed = splitTagImageName(entry.name, isOriginal ? TAG_IMAGES_DIR : TAG_THUMBS_DIR)
    if (!parsed) continue
    const target = isOriginal ? originals : thumbs
    if (target.has(parsed.uuid)) continue // 同 uuid 多条：保留先出现的
    const bytes = await readEntryBuffer(buffer, entry)
    const mime = extToMime(parsed.ext)
    // Blob 自带 type 才能在 <img src=blob:…> 时给出正确的 Content-Type
    target.set(parsed.uuid, { blob: new Blob([bytes], { type: mime || 'application/octet-stream' }), mime })
  }

  const items = []
  const uuids = [...new Set([...originals.keys(), ...thumbs.keys()])].sort()
  for (const uuid of uuids) {
    const source = originals.get(uuid) || thumbs.get(uuid)
    const key = `tag:${uuid}`
    const meta = metaByKey.get(key)
    items.push({
      key,
      blob: source.blob,
      mime: source.mime || (typeof meta?.mime === 'string' ? meta.mime : '')
    })
  }

  if (items.length > 0) {
    bundle.data = bundle.data || {}
    bundle.data.blobs = items
    if (bundle.counts && typeof bundle.counts === 'object') bundle.counts.images = items.length
  }
  return bundle
}

/** CRC32（IEEE 802.3，ZIP 用的就是它） */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let value = i
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[i] = value >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function ensureZipWriteSupport() {
  if (typeof Blob === 'undefined' || typeof TextEncoder === 'undefined') {
    throw new Error('当前环境缺少 Blob/TextEncoder，无法生成 zip')
  }
  if (typeof Uint8Array === 'undefined' || typeof DataView === 'undefined') {
    throw new Error('当前环境缺少 Uint8Array/DataView，无法生成 zip')
  }
}

/** data.json 里不保留 Blob 二进制，只留 key/mime/name 元数据（二进制走 images/ 条目） */
function stripBlobBytes(bundle) {
  const data = { ...(bundle.data || {}) }
  if (Array.isArray(bundle?.data?.blobs)) {
    data.blobs = bundle.data.blobs.map((item) => ({
      key: typeof item?.key === 'string' ? item.key : '',
      mime: typeof item?.mime === 'string' ? item.mime : '',
      name: typeof item?.name === 'string' ? item.name : ''
    }))
  }
  return { ...bundle, data }
}

/**
 * 把 bundle 打成 zip（store 方法 0，不压缩）。
 *
 * 条目：`data.json` + `images/tag_images/<t_uuid>.<ext>`（扩展名由 blob.type/mime 推导，
 * 未知时用 `.bin`）。需要 `Blob.data.blobs` 里的项是带 `arrayBuffer()` 的 Blob。
 *
 * @param {object} bundle 开发计划 §5.4 定义的数据包
 * @param {object} [options]
 * @param {(progress: {phase:'start'|'write'|'done', name?:string, index:number, total:number}) => void|Promise<void>} [options.onProgress]
 * @returns {Promise<Blob>} type 为 application/zip
 */
export async function writeBundleZip(bundle, { onProgress } = {}) {
  if (!bundle || bundle.format !== 'weilin-prompt-bundle') {
    throw new Error('writeBundleZip 需要一个数据包对象（format = weilin-prompt-bundle）')
  }
  ensureZipWriteSupport()
  const report = typeof onProgress === 'function' ? onProgress : null

  const encoder = new TextEncoder()
  const sources = [{ name: 'data.json', bytes: encoder.encode(JSON.stringify(stripBlobBytes(bundle))) }]
  const blobs = Array.isArray(bundle?.data?.blobs) ? bundle.data.blobs : []
  for (const item of blobs) {
    if (!item || typeof item.key !== 'string' || !item.blob) continue
    if (!item.key.startsWith('tag:')) continue
    const uuid = item.key.slice('tag:'.length)
    if (!uuid) continue
    const ext = mimeToExt(item.mime || item.blob.type)
    sources.push({ name: `${TAG_IMAGES_DIR}${uuid}.${ext}`, blob: item.blob })
  }

  const total = sources.length
  if (report) await report({ phase: 'start', index: 0, total })

  const files = []
  let written = 0
  for (const source of sources) {
    let bytes = source.bytes
    if (!bytes) {
      if (typeof source.blob?.arrayBuffer !== 'function') {
        throw new Error(`预览图 ${source.name} 不是可读取的 Blob，无法写入 zip`)
      }
      bytes = new Uint8Array(await source.blob.arrayBuffer())
    }
    if (bytes.length >= 0xffffffff) throw new Error(`条目过大（${bytes.length} 字节），超出 ZIP 单文件上限`)
    files.push({ name: source.name, bytes, crc: crc32(bytes) })
    written += 1
    if (report) await report({ phase: 'write', name: source.name, index: written, total })
  }

  const localParts = []
  const centralParts = []
  let offset = 0
  for (const file of files) {
    const nameBytes = encoder.encode(file.name)

    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, LOCAL_SIGNATURE, true)
    lv.setUint16(4, VERSION_NEEDED, true)
    lv.setUint16(6, FLAG_UTF8, true)
    lv.setUint16(8, METHOD_STORE, true)
    lv.setUint16(10, DOS_TIME, true)
    lv.setUint16(12, DOS_DATE, true)
    lv.setUint32(14, file.crc, true)
    lv.setUint32(18, file.bytes.length, true)
    lv.setUint32(22, file.bytes.length, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    localParts.push(local, file.bytes)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, CENTRAL_SIGNATURE, true)
    cv.setUint16(4, VERSION_NEEDED, true)
    cv.setUint16(6, VERSION_NEEDED, true)
    cv.setUint16(8, FLAG_UTF8, true)
    cv.setUint16(10, METHOD_STORE, true)
    cv.setUint16(12, DOS_TIME, true)
    cv.setUint16(14, DOS_DATE, true)
    cv.setUint32(16, file.crc, true)
    cv.setUint32(20, file.bytes.length, true)
    cv.setUint32(24, file.bytes.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centralParts.push(central)

    offset += local.length + file.bytes.length
  }

  if (offset >= 0xffffffff || files.length >= 0xffff) {
    throw new Error('数据量超出 ZIP 基本格式上限（不支持 ZIP64），请分批导出')
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, EOCD_SIGNATURE, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true)

  const zip = new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' })
  if (report) await report({ phase: 'done', index: files.length, total })
  return zip
}
