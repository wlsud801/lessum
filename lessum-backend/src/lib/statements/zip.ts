import { StatementFormatError } from './errors.js'

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50
const END_RECORD_BYTES = 22
const MAX_COMMENT_BYTES = 0xffff
const MAX_ENTRIES = 2000
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024

export class ZipValidationError extends StatementFormatError {
  constructor(message: string) {
    super(message)
    this.name = 'ZipValidationError'
  }
}

const invalid = () => new ZipValidationError('Invalid XLSX archive')

function findEndRecord(view: DataView): number {
  const lowest = Math.max(0, view.byteLength - END_RECORD_BYTES - MAX_COMMENT_BYTES)
  for (let offset = view.byteLength - END_RECORD_BYTES; offset >= lowest; offset--) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) {
      return offset
    }
  }
  throw invalid()
}

export function validateZip(data: Uint8Array): void {
  if (data.length < END_RECORD_BYTES) {
    throw invalid()
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const end = findEndRecord(view)

  const entryCount = view.getUint16(end + 10, true)
  const directorySize = view.getUint32(end + 12, true)
  const directoryOffset = view.getUint32(end + 16, true)
  if (
    entryCount === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  ) {
    throw new ZipValidationError('Export archive exceeds parsing limits')
  }
  if (directoryOffset + directorySize > data.length) {
    throw invalid()
  }

  const names: string[] = []
  let uncompressedTotal = 0
  let position = directoryOffset
  for (let i = 0; i < entryCount; i++) {
    if (
      position + 46 > data.length ||
      view.getUint32(position, true) !== CENTRAL_DIRECTORY_ENTRY
    ) {
      throw invalid()
    }
    const uncompressedSize = view.getUint32(position + 24, true)
    const nameLength = view.getUint16(position + 28, true)
    const extraLength = view.getUint16(position + 30, true)
    const commentLength = view.getUint16(position + 32, true)
    const entryEnd = position + 46 + nameLength + extraLength + commentLength
    if (entryEnd > data.length) {
      throw invalid()
    }

    names.push(
      Buffer.from(data.subarray(position + 46, position + 46 + nameLength)).toString('utf8'),
    )
    uncompressedTotal += uncompressedSize
    position = entryEnd
  }

  if (entryCount > MAX_ENTRIES || uncompressedTotal > MAX_UNCOMPRESSED_BYTES) {
    throw new ZipValidationError('Export archive exceeds parsing limits')
  }
  if (!names.includes('xl/workbook.xml')) {
    throw new ZipValidationError('Response is not an XLSX workbook')
  }
}
