import { S0, S1 } from './seed-tables.js'

const BLOCK_BYTES = 16
const ROUNDS = 16
const KC = [
  0x9e3779b9, 0x3c6ef373, 0x78dde6e6, 0xf1bbcdcc, 0xe3779b99, 0xc6ef3733,
  0x8dde6e67, 0x1bbcdccf, 0x3779b99e, 0x6ef3733c, 0xdde6e678, 0xbbcdccf1,
  0x779b99e3, 0xef3733c6, 0xde6e678d, 0xbcdccf1b,
]

function g(x: number): number {
  const x0 = x & 0xff
  const x1 = (x >>> 8) & 0xff
  const x2 = (x >>> 16) & 0xff
  const x3 = (x >>> 24) & 0xff

  const z0 = (S0[x0] & 0xfc) ^ (S1[x1] & 0xf3) ^ (S0[x2] & 0xcf) ^ (S1[x3] & 0x3f)
  const z1 = (S0[x0] & 0xf3) ^ (S1[x1] & 0xcf) ^ (S0[x2] & 0x3f) ^ (S1[x3] & 0xfc)
  const z2 = (S0[x0] & 0xcf) ^ (S1[x1] & 0x3f) ^ (S0[x2] & 0xfc) ^ (S1[x3] & 0xf3)
  const z3 = (S0[x0] & 0x3f) ^ (S1[x1] & 0xfc) ^ (S0[x2] & 0xf3) ^ (S1[x3] & 0xcf)

  return ((z3 << 24) | (z2 << 16) | (z1 << 8) | z0) >>> 0
}

export function seedKeySchedule(key: Uint8Array): [number, number][] {
  if (key.length !== BLOCK_BYTES) {
    throw new Error('SEED 키는 16바이트여야 합니다.')
  }
  const view = new DataView(key.buffer, key.byteOffset, key.byteLength)
  let k0 = view.getUint32(0)
  let k1 = view.getUint32(4)
  let k2 = view.getUint32(8)
  let k3 = view.getUint32(12)

  const roundKeys: [number, number][] = []
  for (let i = 0; i < ROUNDS; i++) {
    roundKeys.push([g((k0 + k2 - KC[i]) >>> 0), g((k1 - k3 + KC[i]) >>> 0)])
    if (i % 2 === 0) {
      const next0 = ((k0 >>> 8) | (k1 << 24)) >>> 0
      const next1 = ((k1 >>> 8) | (k0 << 24)) >>> 0
      k0 = next0
      k1 = next1
    } else {
      const next2 = ((k2 << 8) | (k3 >>> 24)) >>> 0
      const next3 = ((k3 << 8) | (k2 >>> 24)) >>> 0
      k2 = next2
      k3 = next3
    }
  }
  return roundKeys
}

function roundFunction(
  [ki0, ki1]: [number, number],
  r0: number,
  r1: number,
): [number, number] {
  const a = (r0 ^ ki0) >>> 0
  const b = (r1 ^ ki1) >>> 0
  const u = g((a ^ b) >>> 0)
  const v = g((u + a) >>> 0)
  const out1 = g((u + v) >>> 0)
  const out0 = (v + out1) >>> 0
  return [out0, out1]
}

function cryptBlock(
  roundKeys: [number, number][],
  input: Uint8Array,
  output: Uint8Array,
) {
  const view = new DataView(input.buffer, input.byteOffset, BLOCK_BYTES)
  let l0 = view.getUint32(0)
  let l1 = view.getUint32(4)
  let r0 = view.getUint32(8)
  let r1 = view.getUint32(12)

  for (let i = 0; i < ROUNDS - 1; i++) {
    const [f0, f1] = roundFunction(roundKeys[i], r0, r1)
    const t0 = r0
    const t1 = r1
    r0 = (l0 ^ f0) >>> 0
    r1 = (l1 ^ f1) >>> 0
    l0 = t0
    l1 = t1
  }
  const [f0, f1] = roundFunction(roundKeys[ROUNDS - 1], r0, r1)
  l0 = (l0 ^ f0) >>> 0
  l1 = (l1 ^ f1) >>> 0

  const out = new DataView(output.buffer, output.byteOffset, BLOCK_BYTES)
  out.setUint32(0, l0)
  out.setUint32(4, l1)
  out.setUint32(8, r0)
  out.setUint32(12, r1)
}

export function seedEncryptBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  const output = new Uint8Array(BLOCK_BYTES)
  cryptBlock(seedKeySchedule(key), block, output)
  return output
}

export function seedDecryptBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  const output = new Uint8Array(BLOCK_BYTES)
  cryptBlock(seedKeySchedule(key).reverse(), block, output)
  return output
}

function assertCbcInput(key: Uint8Array, iv: Uint8Array, data: Uint8Array) {
  if (iv.length !== BLOCK_BYTES) {
    throw new Error('SEED IV는 16바이트여야 합니다.')
  }
  if (data.length % BLOCK_BYTES !== 0) {
    throw new Error('SEED-CBC 입력은 16바이트의 배수여야 합니다.')
  }
  if (key.length !== BLOCK_BYTES) {
    throw new Error('SEED 키는 16바이트여야 합니다.')
  }
}

export function seedCbcDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Uint8Array {
  assertCbcInput(key, iv, data)
  const roundKeys = seedKeySchedule(key).reverse()
  const output = new Uint8Array(data.length)
  const block = new Uint8Array(BLOCK_BYTES)

  for (let offset = 0; offset < data.length; offset += BLOCK_BYTES) {
    cryptBlock(roundKeys, data.subarray(offset, offset + BLOCK_BYTES), block)
    const previous =
      offset === 0 ? iv : data.subarray(offset - BLOCK_BYTES, offset)
    for (let i = 0; i < BLOCK_BYTES; i++) {
      output[offset + i] = block[i] ^ previous[i]
    }
  }
  return output
}

export function seedCbcEncrypt(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Uint8Array {
  assertCbcInput(key, iv, data)
  const roundKeys = seedKeySchedule(key)
  const output = new Uint8Array(data.length)
  const block = new Uint8Array(BLOCK_BYTES)

  for (let offset = 0; offset < data.length; offset += BLOCK_BYTES) {
    const previous =
      offset === 0 ? iv : output.subarray(offset - BLOCK_BYTES, offset)
    for (let i = 0; i < BLOCK_BYTES; i++) {
      block[i] = data[offset + i] ^ previous[i]
    }
    cryptBlock(roundKeys, block, output.subarray(offset, offset + BLOCK_BYTES))
  }
  return output
}
