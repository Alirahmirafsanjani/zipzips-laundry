/**
 * Serialisasi aman untuk JSON.
 * Prisma mengembalikan BigInt/Decimal pada beberapa tipe; JSON.stringify
 * akan melempar error pada BigInt. Fungsi ini memastikan respons selalu bisa
 * diserialisasi.
 */
export function serialize(value) {
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(serialize)
  if (typeof value === 'object') {
    const out = {}
    for (const [key, val] of Object.entries(value)) {
      out[key] = serialize(val)
    }
    return out
  }
  return value
}

export default serialize
