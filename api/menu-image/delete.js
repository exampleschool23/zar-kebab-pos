import { json, methodNotAllowed, readJson } from '../telegram/_lib/http.js'
import { deleteFromR2 } from './_lib/r2.js'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return methodNotAllowed(res, ['DELETE'])

  try {
    const body = await readJson(req)
    const target = body.key || body.url
    await deleteFromR2(target)
    return json(res, 200, { ok: true })
  } catch (error) {
    return json(res, 400, { error: error.message || 'Could not delete menu image' })
  }
}
