const EMPLOYEE_DELIVERED_STATUSES = new Set(['sent', 'confirmed'])
const SENT_DELIVERY_STATUSES = new Set(['sent'])
const DEFAULT_PENDING_RETRY_MS = 2 * 60 * 1000

function shouldRetry(status, attemptedAt, deliveredStatuses, now, pendingRetryMs) {
  if (deliveredStatuses.has(status)) return false
  if (status !== 'pending') return true
  const attemptedAtMs = new Date(attemptedAt || 0).getTime()
  return !Number.isFinite(attemptedAtMs) || now - attemptedAtMs >= pendingRetryMs
}

export function getSalaryPaymentRetryTargets(delivery, {
  now = Date.now(),
  pendingRetryMs = DEFAULT_PENDING_RETRY_MS,
} = {}) {
  return {
    employee: shouldRetry(
      delivery?.status,
      delivery?.attempted_at,
      EMPLOYEE_DELIVERED_STATUSES,
      now,
      pendingRetryMs
    ),
    group: shouldRetry(
      delivery?.group_status,
      delivery?.group_attempted_at,
      SENT_DELIVERY_STATUSES,
      now,
      pendingRetryMs
    ),
  }
}

export function getSalaryEventRetryTargets(delivery, {
  now = Date.now(),
  pendingRetryMs = DEFAULT_PENDING_RETRY_MS,
} = {}) {
  const teamDeliveryApplies = ['bonus', 'fine', 'absence'].includes(delivery?.event_type)
  return {
    employee: shouldRetry(
      delivery?.employee_status,
      delivery?.employee_attempted_at,
      SENT_DELIVERY_STATUSES,
      now,
      pendingRetryMs
    ),
    group: shouldRetry(
      delivery?.status,
      delivery?.attempted_at,
      SENT_DELIVERY_STATUSES,
      now,
      pendingRetryMs
    ),
    team: teamDeliveryApplies && shouldRetry(
      delivery?.team_status,
      delivery?.team_attempted_at,
      SENT_DELIVERY_STATUSES,
      now,
      pendingRetryMs
    ),
  }
}
