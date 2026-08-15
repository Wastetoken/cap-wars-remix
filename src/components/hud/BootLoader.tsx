import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import loading1 from '@/Loading 1.png'
import loading2 from '@/Loading 2.png'

// ============================================================================
// Loading screens — full-bleed dungeon artwork alternating between the two
// Loading PNGs with a crossfade, plus a thin progress bar. No title text.
// `LoadingArt` is the presentational piece (used by the level-transition
// overlay); `BootLoader` wraps it with the asset-progress gate for startup.
// ============================================================================

const CROSSFADE_MS = 2600

export const LoadingArt = ({
  label,
  progress,
}: {
  label?: string
  progress?: number
}) => {
  const [flip, setFlip] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setFlip((f) => !f), CROSSFADE_MS)
    return () => clearInterval(id)
  }, [])

  const img = (src: string, visible: boolean) => (
    <img
      src={src}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        opacity: visible ? 1 : 0,
        transition: 'opacity 1.1s ease-in-out',
      }}
    />
  )

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: '#060a0f',
        overflow: 'hidden',
      }}
    >
      {img(loading1, !flip)}
      {img(loading2, flip)}

      {/* Bottom-center status: optional label + slim progress bar */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 42,
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          width: 260,
        }}
      >
        {label && (
          <div
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: 15,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: '#e8e0cf',
              textShadow: '0 2px 10px rgba(0,0,0,0.9)',
            }}
          >
            {label}
          </div>
        )}
        {progress !== undefined && (
          <>
            <div
              style={{
                width: '100%',
                height: 3,
                background: 'rgba(232, 224, 207, 0.15)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.round(progress)}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #b8862f, #ffd98a)',
                  transition: 'width 0.25s ease-out',
                }}
              />
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 11,
                letterSpacing: '0.3em',
                color: 'rgba(232, 224, 207, 0.65)',
                textShadow: '0 1px 6px rgba(0,0,0,0.9)',
              }}
            >
              {Math.round(progress)}%
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Startup gate: covers the whole app until every asset (both canvases share
 *  the default loading manager) has finished, then fades out and unmounts. */
export const BootLoader = () => {
  const { progress } = useProgress()
  const [done, setDone] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (progress >= 100 && !done) setDone(true)
  }, [progress, done])

  // Let the fade-out transition play before unmounting
  useEffect(() => {
    if (!done) return
    const id = setTimeout(() => setGone(true), 700)
    return () => clearTimeout(id)
  }, [done])

  if (gone) return null
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        opacity: done ? 0 : 1,
        transition: 'opacity 0.65s ease-out',
        pointerEvents: done ? 'none' : 'auto',
      }}
    >
      <LoadingArt progress={progress} />
    </div>
  )
}
