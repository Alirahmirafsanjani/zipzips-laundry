import { z } from 'zod'

export const setSettingSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.record(z.any())]),
})

export const idParamSchema = z.object({
  key: z.string().trim().min(1).max(60),
})

export default { setSettingSchema, idParamSchema }
