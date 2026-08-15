import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import { pass, oneMinus, vec2, screenUV, length, smoothstep } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { smaa } from "three/examples/jsm/tsl/display/SMAANode.js";

export const PostProcessing = () => {
  const { renderer, scene, camera } = useThree();

  const postProcessingRef = useRef<THREE.PostProcessing>(null);

  // the postprocessing process is easy, take your scene Color
  // add whatever pass you want following the docs
  // motionBlur, GTAO, TRAA, SMAA, Bloom, DOF are pretty interesting and easy to use

  // TODO: create a color grading node, will show how to create custom pass as well, it's easy

  useEffect(() => {
    const scenePass = pass(scene, camera, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    // Linear HDR straight from the scene pass — no gamma hacks ahead of
    // tonemapping. The single ACES + sRGB conversion happens at the end via
    // PostProcessing's output transform (renderer.toneMapping).
    const scenePassColor = scenePass.getTextureNode("output");

    // Real vignette: darkens the base image toward the corners.
    const center = vec2(0.5)
    const vignette = smoothstep(0., 0.5, oneMinus(length(screenUV.sub(center))).pow(2.))

    // Bloom from the clean HDR source so the threshold gates on actual scene
    // luminance (bright/emissive surfaces only), not a vignette-skewed copy.
    const bloomResult = bloom(scenePassColor, 0.25, 0.6, 0.85) // strength, radius, threshold

    // Sum in HDR, then SMAA; tonemapping runs once, after everything.
    const postProcessing = new THREE.PostProcessing(renderer);
    postProcessing.outputNode = smaa(scenePassColor.mul(vignette).add(bloomResult));
    postProcessingRef.current = postProcessing;

    return () => {
      postProcessingRef.current = null;
    };
  }, [renderer, scene, camera]);

  useFrame(() => {
    if (postProcessingRef.current) {
      renderer.clear();
      postProcessingRef.current.render();
    }
  }, 1);
  return null;
};
