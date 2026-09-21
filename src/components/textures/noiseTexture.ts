import { TextureLoader, RepeatWrapping, NearestFilter } from "three";

export const noiseTexture = new TextureLoader().load('./noise.png');
noiseTexture.wrapS = noiseTexture.wrapT = RepeatWrapping;
noiseTexture.minFilter = noiseTexture.magFilter = NearestFilter;