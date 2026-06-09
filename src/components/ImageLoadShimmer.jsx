import React, { useEffect, useState } from 'react'

export default function ImageLoadShimmer({
  src,
  alt = '',
  className = '',
  containerClassName = 'h-full w-full',
  fallback = null,
  loading = 'lazy',
  fetchPriority,
  timeoutMs = 3500,
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setLoaded(false)
    setFailed(false)
    if (!src || !timeoutMs) return undefined
    const timer = window.setTimeout(() => setFailed(true), timeoutMs)
    return () => window.clearTimeout(timer)
  }, [src, timeoutMs])

  if (!src || failed) {
    return fallback
  }

  return (
    <div className={`relative overflow-hidden bg-orange-50 ${containerClassName}`}>
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-orange-50 via-white to-orange-100" />
      )}
      <img
        src={src}
        alt={alt}
        className={`block ${className} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        loading={loading}
        fetchPriority={fetchPriority}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
