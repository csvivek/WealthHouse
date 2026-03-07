import zlib from 'zlib'

export interface StatementArchiveEntry {
  name: string
  mimeType: string
  data: Buffer
  text: string | null
  pageOrder: number
}

interface ZipCentralDirectoryEntry {
  compressionMethod: number
  compressedSize: number
  uncompressedSize: number
  fileName: string
  localHeaderOffset: number
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const MAX_EOCD_SCAN = 65557

function getFileExtension(fileName: string) {
  const normalized = fileName.toLowerCase()
  const index = normalized.lastIndexOf('.')
  return index >= 0 ? normalized.slice(index) : ''
}

function inferMimeType(fileName: string) {
  switch (getFileExtension(fileName)) {
    case '.txt':
      return 'text/plain'
    case '.json':
      return 'application/json'
    case '.jpeg':
    case '.jpg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    default:
      return 'application/octet-stream'
  }
}

function inferPageOrder(fileName: string) {
  const normalized = fileName.replace(/\\/g, '/')
  const matches = normalized.match(/(?:^|\/)(\d+)(?:\.[^.]+)?$/)
  if (matches) {
    return Number.parseInt(matches[1], 10)
  }

  if (normalized.endsWith('manifest.json')) {
    return 0
  }

  return Number.MAX_SAFE_INTEGER
}

function decodeFileName(fileNameBytes: Buffer, utf8: boolean) {
  return new TextDecoder(utf8 ? 'utf-8' : 'latin1').decode(fileNameBytes)
}

function locateEndOfCentralDirectory(bytes: Buffer) {
  const minimumOffset = Math.max(0, bytes.length - MAX_EOCD_SCAN)
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset
    }
  }

  return -1
}

function readCentralDirectoryEntries(bytes: Buffer): ZipCentralDirectoryEntry[] {
  const eocdOffset = locateEndOfCentralDirectory(bytes)
  if (eocdOffset < 0) {
    throw new Error('ZIP archive is missing an end-of-central-directory record.')
  }

  const centralDirectorySize = bytes.readUInt32LE(eocdOffset + 12)
  const centralDirectoryOffset = bytes.readUInt32LE(eocdOffset + 16)
  const entries: ZipCentralDirectoryEntry[] = []
  const endOffset = centralDirectoryOffset + centralDirectorySize

  let offset = centralDirectoryOffset
  while (offset < endOffset) {
    if (bytes.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error('ZIP archive central directory is malformed.')
    }

    const generalPurposeFlag = bytes.readUInt16LE(offset + 8)
    const compressionMethod = bytes.readUInt16LE(offset + 10)
    const compressedSize = bytes.readUInt32LE(offset + 20)
    const uncompressedSize = bytes.readUInt32LE(offset + 24)
    const fileNameLength = bytes.readUInt16LE(offset + 28)
    const extraLength = bytes.readUInt16LE(offset + 30)
    const commentLength = bytes.readUInt16LE(offset + 32)
    const localHeaderOffset = bytes.readUInt32LE(offset + 42)
    const fileNameStart = offset + 46
    const fileNameBytes = bytes.subarray(fileNameStart, fileNameStart + fileNameLength)
    const fileName = decodeFileName(fileNameBytes, Boolean(generalPurposeFlag & 0x0800))

    entries.push({
      compressionMethod,
      compressedSize,
      uncompressedSize,
      fileName,
      localHeaderOffset,
    })

    offset += 46 + fileNameLength + extraLength + commentLength
  }

  return entries
}

function extractEntryData(bytes: Buffer, entry: ZipCentralDirectoryEntry) {
  const headerOffset = entry.localHeaderOffset
  if (bytes.readUInt32LE(headerOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error(`ZIP archive local header is malformed for ${entry.fileName}.`)
  }

  const fileNameLength = bytes.readUInt16LE(headerOffset + 26)
  const extraLength = bytes.readUInt16LE(headerOffset + 28)
  const dataStart = headerOffset + 30 + fileNameLength + extraLength
  const compressedData = bytes.subarray(dataStart, dataStart + entry.compressedSize)

  if (entry.compressionMethod === 0) {
    return Buffer.from(compressedData)
  }

  if (entry.compressionMethod === 8) {
    return zlib.inflateRawSync(compressedData)
  }

  throw new Error(`ZIP compression method ${entry.compressionMethod} is not supported for ${entry.fileName}.`)
}

export function isZipArchive(bytes: Buffer) {
  if (bytes.length < 4) {
    return false
  }

  const signature = bytes.readUInt32LE(0)
  return (
    signature === LOCAL_FILE_HEADER_SIGNATURE ||
    signature === CENTRAL_DIRECTORY_SIGNATURE ||
    signature === EOCD_SIGNATURE
  )
}

export function extractStatementArchiveEntries(bytes: Buffer): StatementArchiveEntry[] {
  const entries = readCentralDirectoryEntries(bytes)

  return entries
    .filter((entry) => {
      if (entry.fileName.endsWith('/')) {
        return false
      }

      const extension = getFileExtension(entry.fileName)
      return extension === '.txt' || extension === '.json' || extension === '.jpeg' || extension === '.jpg' || extension === '.png'
    })
    .map((entry) => {
      const data = extractEntryData(bytes, entry)
      const mimeType = inferMimeType(entry.fileName)
      const text = mimeType.startsWith('text/') || mimeType === 'application/json' ? data.toString('utf8') : null

      return {
        name: entry.fileName,
        mimeType,
        data,
        text,
        pageOrder: inferPageOrder(entry.fileName),
      }
    })
    .sort((left, right) => {
      if (left.pageOrder !== right.pageOrder) {
        return left.pageOrder - right.pageOrder
      }

      if (left.mimeType !== right.mimeType) {
        return left.mimeType.startsWith('text/') || left.mimeType === 'application/json' ? -1 : 1
      }

      return left.name.localeCompare(right.name)
    })
}
