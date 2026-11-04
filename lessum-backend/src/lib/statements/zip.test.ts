import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildZip } from './test-support.js'
import { ZipValidationError, validateZip } from './zip.js'

function expectZipError(data: Uint8Array, message: RegExp) {
  assert.throws(
    () => validateZip(data),
    (error: unknown) => error instanceof ZipValidationError && message.test(error.message),
  )
}

const workbook = () => buildZip([{ name: 'xl/workbook.xml', content: '<workbook/>' }])

describe('validateZip', () => {
  it('xl/workbook.xml이 있는 정상 ZIP은 통과한다', () => {
    assert.doesNotThrow(() => validateZip(workbook()))
  })

  it('다른 항목이 함께 있어도 통과한다', () => {
    const data = buildZip([
      { name: '[Content_Types].xml', content: '<Types/>' },
      { name: 'xl/workbook.xml', content: '<workbook/>' },
      { name: 'xl/worksheets/sheet1.xml', content: '<worksheet/>' },
    ])

    assert.doesNotThrow(() => validateZip(data))
  })

  it('xl/workbook.xml이 없으면 XLSX가 아니라고 거부한다', () => {
    expectZipError(buildZip([{ name: 'other.txt', content: 'x' }]), /not an XLSX workbook/)
  })

  it('ZIP이 아닌 데이터는 거부한다', () => {
    expectZipError(Buffer.from('not a zip at all, just text data!!'), /Invalid XLSX archive/)
    expectZipError(new Uint8Array(0), /Invalid XLSX archive/)
    expectZipError(Buffer.from('PK\x03\x04'), /Invalid XLSX archive/)
  })

  it('잘린 ZIP은 거부한다', () => {
    const data = workbook()

    expectZipError(data.subarray(0, data.length - 10), /Invalid XLSX archive/)
    expectZipError(data.subarray(0, 40), /Invalid XLSX archive/)
  })

  it('항목 수가 2000개를 넘으면 거부한다', () => {
    const many = Array.from({ length: 2001 }, (_, i) => ({ name: `f${i}.txt` }))

    expectZipError(buildZip([{ name: 'xl/workbook.xml' }, ...many]), /exceeds parsing limits/)
  })

  it('항목 수가 정확히 2000개이면 통과한다', () => {
    const many = Array.from({ length: 1999 }, (_, i) => ({ name: `f${i}.txt` }))

    assert.doesNotThrow(() => validateZip(buildZip([{ name: 'xl/workbook.xml' }, ...many])))
  })

  it('압축 해제 크기 합계가 50 MiB를 넘으면 압축을 풀지 않고 거부한다', () => {
    const data = buildZip([
      { name: 'xl/workbook.xml', content: '<workbook/>' },
      { name: 'bomb.bin', declaredSize: 51 * 1024 * 1024 },
    ])

    expectZipError(data, /exceeds parsing limits/)
  })

  it('항목 하나만 크더라도 합계 기준으로 판단한다', () => {
    const data = buildZip([
      { name: 'xl/workbook.xml', declaredSize: 30 * 1024 * 1024 },
      { name: 'a.bin', declaredSize: 30 * 1024 * 1024 },
    ])

    expectZipError(data, /exceeds parsing limits/)
  })

  it('중앙 디렉터리 위치가 범위를 벗어나면 거부한다', () => {
    const data = Buffer.from(workbook())
    data.writeUInt32LE(data.length + 100, data.length - 22 + 16)

    expectZipError(data, /Invalid XLSX archive/)
  })

  it('ZIP64 표식이 있으면 한도 초과로 거부한다', () => {
    const data = Buffer.from(workbook())
    data.writeUInt16LE(0xffff, data.length - 22 + 10)

    expectZipError(data, /exceeds parsing limits/)
  })

  it('중앙 디렉터리 항목 서명이 깨지면 거부한다', () => {
    const data = Buffer.from(workbook())
    const directoryOffset = data.readUInt32LE(data.length - 22 + 16)
    data.writeUInt32LE(0xdeadbeef, directoryOffset)

    expectZipError(data, /Invalid XLSX archive/)
  })

  it('ZIP 뒤에 댓글이 붙어 있어도 끝 레코드를 찾는다', () => {
    const data = workbook()
    data.writeUInt16LE(5, data.length - 2)
    const withComment = Buffer.concat([data, Buffer.from('hello')])

    assert.doesNotThrow(() => validateZip(withComment))
  })
})
