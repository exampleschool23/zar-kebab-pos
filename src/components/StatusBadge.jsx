import React from 'react'

const STATUS_MAP = {
  // Table statuses
  available:  { label: 'Available',  classes: 'bg-green-50 text-green-700 border-green-200'  },
  occupied:   { label: 'Occupied',   classes: 'bg-orange-50 text-orange-700 border-orange-200' },
  needs_bill: { label: 'Needs Bill', classes: 'bg-red-50 text-red-600 border-red-200'         },
  // User statuses
  active:     { label: 'Active',     classes: 'bg-green-50 text-green-700 border-green-200'  },
  pending:    { label: 'Pending',    classes: 'bg-amber-50 text-amber-700 border-amber-200'  },
  disabled:   { label: 'Disabled',   classes: 'bg-red-50 text-red-600 border-red-200'        },
  // Order statuses
  new:        { label: 'New',        classes: 'bg-blue-50 text-blue-700 border-blue-200'     },
  preparing:  { label: 'Preparing',  classes: 'bg-orange-50 text-orange-700 border-orange-200' },
  ready:      { label: 'Ready',      classes: 'bg-green-50 text-green-700 border-green-200'  },
  paid:       { label: 'Paid',       classes: 'bg-gray-50 text-gray-500 border-gray-200'     },
}

/**
 * @param {{ status: string, className?: string }} props
 */
export default function StatusBadge({ status, className = '' }) {
  const config = STATUS_MAP[status] || { label: status, classes: 'bg-gray-50 text-gray-500 border-gray-200' }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.classes} ${className}`}
    >
      {config.label}
    </span>
  )
}
