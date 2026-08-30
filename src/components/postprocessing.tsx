import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { useGameStore } from "@/store";

/** Mild radial darkening at screen edges — ported from the TSL vignette. */
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float dist = length(vUv - vec2(0.5));
      float vignette = smoothstep(0.0, 0.5, 1.0 - dist * dist);
      gl_FragColor = vec4(color.rgb * vignette, color.a);
    }
  `,
};

export const PostProcessing = () => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const postProcessingEnabled = useGameStore((s) => s.settings.postProcessing);

  const composerRef = useRef<EffectComposer | null>(null);

  // (Re)build the composer when the renderer, scene, camera, or
  // post-processing toggle changes.
  useEffect(() => {
    const composer = new EffectComposer(gl);
    composer.setPixelRatio(gl.getPixelRatio());
    composer.addPass(new RenderPass(scene, camera));

    if (postProcessingEnabled) {
      // Bloom params from the TSL version: threshold 0.15, smoothing 0.6, intensity 0.85
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(size.width, size.height),
        0.85, // strength
        0.6, // radius
        0.15 // threshold
      );
      composer.addPass(bloomPass);

      composer.addPass(new ShaderPass(VignetteShader));

      composer.addPass(new SMAAPass(size.width, size.height));
    }

    composer.addPass(new OutputPass());
    composer.setSize(size.width, size.height);
    composerRef.current = composer;

    return () => {
      composer.dispose();
      composerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, postProcessingEnabled]);

  // Resize the composer (and all passes) when the viewport changes.
  useEffect(() => {
    if (composerRef.current) {
      composerRef.current.setPixelRatio(gl.getPixelRatio());
      composerRef.current.setSize(size.width, size.height);
    }
  }, [size.width, size.height, gl]);

  // Priority 1 takes over the render loop — fiber skips its default
  // gl.render() call and we render through the EffectComposer instead.
  useFrame((_, delta) => {
    if (composerRef.current) {
      composerRef.current.render(delta);
    }
  }, 1);

  return null;
};
