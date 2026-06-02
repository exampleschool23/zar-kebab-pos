import { json, methodNotAllowed } from '../telegram/_lib/http.js'
import { readMultipart } from './_lib/multipart.js'
import { assertImageFile, makeObjectKey, uploadToR2 } from './_lib/r2.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res)

  try {
    const { fields, file } = await readMultipart(req)
    const type = String(fields.type || '')
    assertImageFile(file)
    const key = makeObjectKey({
      type,
      entityId: fields.entityId,
    })
    const result = await uploadToR2({
      key,
      file: {
        ...file,
        contentType: file.contentType || 'image/webp',
      },
    })
    return json(res, 200, result)
  } catch (error) {
    return json(res, 400, { error: error.message || 'Could not upload menu image' })
  }
}
