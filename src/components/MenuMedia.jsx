import React, { useEffect, useState } from 'react'
import ImageLoadShimmer from './ImageLoadShimmer'
import { isMenuVideoUrl } from '../lib/menuMedia'

export default function MenuMedia({
  src,
  alt = '',
  className = '',
  containerClassName = '',
  fallback = null,
  loading = 'lazy',
  fetchPriority,
  controls = false,
  autoPlay = true,
  loop = true,
  muted = true,
  preload = 'metadata',
}) {
  const [videoFailed, setVideoFailed] = useState(false)

  useEffect(() => {
    setVideoFailed(false)
  }, [src])

  if (!isMenuVideoUrl(src)) {
    return (
      <ImageLoadShimmer
        src={src}
        alt={alt}
        className={className}
        containerClassName={containerClassName}
        loading={loading}
        fetchPriority={fetchPriority}
        fallback={fallback}
      />
    )
  }

  if (videoFailed || !src) return fallback

  return (
    <video
      src={src}
      aria-label={alt}
      className={className}
      controls={controls}
      autoPlay={autoPlay}
      loop={loop}
      muted={muted}
      playsInline
      preload={preload}
      onError={() => setVideoFailed(true)}
    />
  )
}
