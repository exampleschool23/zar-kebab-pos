import React, { useEffect, useState } from 'react'

export default function ImageLoadShimmer({
  src,
  alt = '',
  className = '',
  containerClassName = 'h-full w-full',
  fallback = null,
  loading = 'lazy',
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setLoaded(false)
    setFailed(false)
  }, [src])

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
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
