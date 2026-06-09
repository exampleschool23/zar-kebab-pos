import React from 'react'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'

const STATUS_MAP = {
  // Table statuses
  available:  { labelKey: 'available',  classes: 'bg-green-50 text-green-700 border-green-200'  },
  occupied:   { labelKey: 'occupied',   classes: 'bg-orange-50 text-orange-700 border-orange-200' },
  needs_bill: { labelKey: 'needsBill', classes: 'bg-red-50 text-red-600 border-red-200'         },
  waiting_kitchen: { labelKey: 'waiting', classes: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  // User statuses
  active:     { labelKey: 'active',     classes: 'bg-green-50 text-green-700 border-green-200'  },
  pending:    { labelKey: 'pending',    classes: 'bg-amber-50 text-amber-700 border-amber-200'  },
  disabled:   { labelKey: 'disabled',   classes: 'bg-red-50 text-red-600 border-red-200'        },
  // Order statuses
  sent_to_kitchen: { labelKey: 'sent', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  new:        { labelKey: 'new',        classes: 'bg-blue-50 text-blue-700 border-blue-200'     },
  preparing:  { labelKey: 'preparing',  classes: 'bg-orange-50 text-orange-700 border-orange-200' },
  ready:      { labelKey: 'ready',      classes: 'bg-blue-50 text-blue-700 border-blue-200'     },
  paid:       { labelKey: 'paid',       classes: 'bg-gray-50 text-gray-500 border-gray-200'     },
  unpaid:     { labelKey: 'unpaid',     classes: 'bg-amber-50 text-amber-700 border-amber-200' },
}

/**
 * @param {{ status: string, className?: string }} props
 */
export default function StatusBadge({ status, className = '', lang: langProp }) {
  const { state } = useApp()
  const lang = langProp || state.lang || 'ru'
  const config = STATUS_MAP[status] || { label: status, classes: 'bg-gray-50 text-gray-500 border-gray-200' }
  const label = config.labelKey ? t(lang, config.labelKey) : config.label
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.classes} ${className}`}
    >
      {label}
    </span>
  )
}
