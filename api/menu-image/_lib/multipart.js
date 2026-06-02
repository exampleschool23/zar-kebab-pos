const MAX_BODY_SIZE = 6 * 1024 * 1024

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_SIZE) throw new Error('Upload request is too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function parseHeaders(raw) {
  const headers = {}
  raw.split(/\r?\n/).forEach(line => {
    const idx = line.indexOf(':')
    if (idx === -1) return
    headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim()
  })
  return headers
}

function fieldName(disposition) {
  return disposition?.match(/\bname="([^"]+)"/)?.[1] || ''
}

function fileName(disposition) {
  return disposition?.match(/\bfilename="([^"]*)"/)?.[1] || ''
}

export async function readMultipart(req) {
  const contentType = req.headers['content-type'] || ''
  const boundary = contentType.match(/boundary=([^;]+)/)?.[1]
  if (!boundary) throw new Error('multipart/form-data is required')

  const body = await readBody(req)
  const marker = Buffer.from(`--${boundary}`)
  const fields = {}
  let file = null
  let offset = 0

  while (offset < body.length) {
    const partStart = body.indexOf(marker, offset)
    if (partStart === -1) break
    const contentStart = partStart + marker.length
    if (body.slice(contentStart, contentStart + 2).toString() === '--') break

    const headersStart = contentStart + (body.slice(contentStart, contentStart + 2).toString() === '\r\n' ? 2 : 0)
    const headersEnd = body.indexOf(Buffer.from('\r\n\r\n'), headersStart)
    if (headersEnd === -1) break

    const headers = parseHeaders(body.slice(headersStart, headersEnd).toString('utf8'))
    const dataStart = headersEnd + 4
    const nextPart = body.indexOf(marker, dataStart)
    if (nextPart === -1) break

    let dataEnd = nextPart
    if (body.slice(dataEnd - 2, dataEnd).toString() === '\r\n') dataEnd -= 2
    const data = body.slice(dataStart, dataEnd)

    const name = fieldName(headers['content-disposition'])
    const filename = fileName(headers['content-disposition'])
    if (name === 'file' && filename) {
      file = {
        filename,
        contentType: headers['content-type'] || '',
        buffer: data,
      }
    } else if (name) {
      fields[name] = data.toString('utf8')
    }

    offset = nextPart
  }

  return { fields, file }
}
