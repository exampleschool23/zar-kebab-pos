export const POS_WRITE_TIMEOUT_MS = 15000

export function createWriteTimeoutError(actionType = 'write') {
  const error = new Error('Saving changes took too long. Please check the connection and try again.')
  error.name = 'POSWriteTimeoutError'
  error.code = 'POS_WRITE_TIMEOUT'
  error.actionType = actionType
  error.isPOSWriteTimeout = true
  return error
}

export function isWriteTimeoutError(error) {
  return error?.isPOSWriteTimeout === true || error?.code === 'POS_WRITE_TIMEOUT'
}

export function withWriteTimeout(operation, actionType = 'write', timeoutMs = POS_WRITE_TIMEOUT_MS) {
  const delay = Number(timeoutMs)
  if (!Number.isFinite(delay) || delay <= 0) {
    return Promise.resolve(typeof operation === 'function' ? operation() : operation)
  }

  let timeoutId
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeoutError = createWriteTimeoutError(actionType)
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller?.abort(timeoutError)
      reject(timeoutError)
    }, delay)
  })

  let operationPromise
  try {
    operationPromise = Promise.resolve(typeof operation === 'function' ? operation(controller?.signal) : operation)
  } catch (error) {
    clearTimeout(timeoutId)
    return Promise.reject(error)
  }

  const guardedOperation = operationPromise.catch(error => {
    if (controller?.signal?.aborted && !isWriteTimeoutError(error)) throw timeoutError
    throw error
  })

  return Promise.race([guardedOperation, timeout])
    .finally(() => clearTimeout(timeoutId))
}
