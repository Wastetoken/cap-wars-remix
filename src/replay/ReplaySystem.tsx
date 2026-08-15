import { useFrame } from '@react-three/fiber'
import { useGameStore } from '@/store'
import { tickRecord, tickPlayback } from './session'

/**
 * Drives the replay recorder/playback engine. Recording runs alongside live
 * gameplay (30 Hz snapshots); playback applies recorded frames to the frozen
 * scene. All heavy lifting lives in ./session — this is just the frame hook.
 */
export const ReplaySystem = () => {
  useFrame((_, delta) => {
    const phase = useGameStore.getState().replayPhase
    if (phase === 'recording') tickRecord(delta)
    else if (phase === 'playback') tickPlayback(delta)
  })
  return null
}
