import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { DirectionalLight } from "three";
import { useGameStore } from "../store";
import { LEVELS } from "@/game/levels";

export const Lights = () => {
  const shadowCameraSize = 18;
  const directionalLight = useRef<DirectionalLight>(null!)

  const currentLevel = useGameStore((s) => s.currentLevel)
  const levelConfig = LEVELS[currentLevel] ?? LEVELS[0]
  const shadows = useGameStore((s) => s.settings.shadows)
  const shadowMapSize = shadows === 'high' ? 1024 : 512

  useFrame(() => {

    const playerPosition = useGameStore.getState().playerPosition;
    if (!playerPosition || !directionalLight.current) return;

    {
      directionalLight.current.position.x = playerPosition.x - 2;
      directionalLight.current.target.position.x = playerPosition.x;

      directionalLight.current.position.y = playerPosition.y + 5;
      directionalLight.current.target.position.y = playerPosition.y;

      directionalLight.current.position.z = playerPosition.z + 2;
      directionalLight.current.target.position.z = playerPosition.z;

      directionalLight.current.target.updateMatrixWorld();
    }
  })
  return (
    <>
      <color attach="background" args={[levelConfig.background]} />
      <directionalLight
        castShadow={shadows !== 'off'}
        position={[20, 40, 20]}
        intensity={levelConfig.lightIntensity}
        color={levelConfig.lightColor}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-camera-near={1}
        shadow-camera-far={100}
        shadow-camera-left={-shadowCameraSize}
        shadow-camera-right={shadowCameraSize}
        shadow-camera-top={shadowCameraSize}
        shadow-camera-bottom={-shadowCameraSize}
        shadow-bias={-0.01}
        ref={directionalLight}
      />
      <ambientLight intensity={levelConfig.ambientIntensity} />
    </>
  );
}
