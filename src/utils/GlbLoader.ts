import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

let sharedDracoLoader: DRACOLoader | null = null;

/**
 * Returns a shared DRACOLoader backed by local /draco/ WASM decoders (zero CDN dependency).
 */
export function getSharedDracoLoader(): DRACOLoader {
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader();
    sharedDracoLoader.setDecoderPath('/draco/');
    sharedDracoLoader.setDecoderConfig({ type: 'wasm' });
  }
  return sharedDracoLoader;
}

/**
 * Creates a GLTFLoader pre-configured with local Draco mesh decompression.
 */
export function createDracoGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setDRACOLoader(getSharedDracoLoader());
  return loader;
}
