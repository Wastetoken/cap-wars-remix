import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import { pass, oneMinus, vec2, screenUV, length, smoothstep } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { smaa } from "three/examples/jsm/tsl/display/SMAANode.js";
import { useGameStore } from "@/store";

export const PostProcessing = () => {
  const { renderer, scene, camera } = useThree();
  const postProcessingEnabled = useGameStore((s) => s.settings.postProcessing)

  const postProcessingRef = useRef<THREE.PostProcessing>(null);

  useEffect(() => {
    if (!postProcessingEnabled) return

    const scenePass = pass(scene, camera, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    const scenePassColor = scenePass.getTextureNode("output");

    const center = vec2(0.5)
    const vignette = smoothstep(0., 0.5, oneMinus(length(screenUV.sub(center))).pow(2.))

    const bloomResult = bloom(scenePassColor, 0.25, 0.6, 0.85)

    const postProcessing = new THREE.PostProcessing(renderer);
    postProcessing.outputNode = smaa(scenePassColor.mul(vignette).add(bloomResult));
    postProcessingRef.current = postProcessing;

    return () => {
      postProcessingRef.current = null;
    };
  }, [renderer, scene, camera, postProcessingEnabled]);

  useFrame(() => {
    if (!postProcessingEnabled || !postProcessingRef.current) return
    renderer.clear();
    postProcessingRef.current.render();
  }, 1);
  return null;
};
