export const toolDefinition = {
  name: 'repo_nav',
  title: 'Token-efficient repository navigation',
  description: 'Navigate live code with bounded output: guide; map(q); find(exact symbol or task phrase); outline(path|id); read(id|path,range); refs(id|q). Continue with cursor only.',
  inputSchema: {
    type: 'object',
    properties: {
      op: { type: 'string', enum: ['guide', 'map', 'find', 'outline', 'read', 'refs'] },
      q: { type: 'string', description: 'Query for map, find, or refs.' },
      path: { type: 'string', description: 'Project-relative indexed file.' },
      id: { type: 'string', description: 'Source ID returned by find or outline.' },
      range: { type: 'string', description: 'Inclusive lines, start:end.' },
      cursor: { type: 'string', description: 'Opaque next cursor; continuation needs only op and cursor.' },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
      max_chars: { type: 'integer', minimum: 500, maximum: 16000 },
    },
    required: ['op'],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
}

export const serverInstructions = 'Use repo_nav before broad searches or whole-file reads. For unfamiliar work call guide once; then find, outline, and read only selected IDs or ranges. Prefer defaults and keep max_chars at or below 6000. Feature rows list paths and have no source ID. Continue pagination with op+cursor. Live read-only results are project-confined and revision-bound.'
