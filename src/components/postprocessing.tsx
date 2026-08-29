import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import { pass, oneMinus, vec2, screenUV, length, smoothstep } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { smaa } from "three/examples/jsm/tsl/display/SMAANode.js";
import { useGameStore } from "@/store";

export const PostProcessing = () => {
  const { renderer, scene, camera } = useThree();
  const postProcessingQuality = useGameStore((s) => s.settings.postProcessing)

  const postProcessingRef = useRef<THREE.PostProcessing>(null);
  const isWebGPU = useRef(false);

  useEffect(() => {
    isWebGPU.current = renderer.constructor.name.includes('WebGPU') || (renderer as any).isWebGPURenderer === true;

    if (!isWebGPU.current) return;

    const scenePass = pass(scene, camera, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    const scenePassColor = scenePass.getTextureNode("output");

    const postProcessing = new THREE.PostProcessing(renderer);

    if (postProcessingQuality !== 'off') {
      const center = vec2(0.5)
      const vignette = smoothstep(0., 0.5, oneMinus(length(screenUV.sub(center))).pow(2.))
      const bloomResult = bloom(scenePassColor, 0.15, 0.6, 0.85)
      const withBloom = scenePassColor.mul(vignette).add(bloomResult)
      postProcessing.outputNode = postProcessingQuality === 'high'
        ? smaa(withBloom)
        : withBloom
    } else {
      postProcessing.outputNode = scenePassColor;
    }

    postProcessingRef.current = postProcessing;

    return () => {
      postProcessingRef.current = null;
    };
  }, [renderer, scene, camera, postProcessingQuality]);

  useFrame(() => {
    if (!isWebGPU.current) return;
    if (postProcessingRef.current) {
      postProcessingRef.current.render();
    }
  }, 1);
  return null;
};
