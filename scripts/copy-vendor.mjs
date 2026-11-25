import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const mediapipeWasmSrc = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const mediapipeWasmDest = resolve(root, 'public/vendor/mediapipe');

if (existsSync(mediapipeWasmSrc)) {
  mkdirSync(mediapipeWasmDest, { recursive: true });
  cpSync(mediapipeWasmSrc, mediapipeWasmDest, { recursive: true });
}

const modelSrc = resolve(root, 'vendor-assets');
const modelDest = resolve(root, 'public/models');

if (existsSync(modelSrc)) {
  mkdirSync(modelDest, { recursive: true });
  cpSync(modelSrc, modelDest, { recursive: true });
}
