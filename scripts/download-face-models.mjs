import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL =
  "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/";

const files = [
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model-shard1",
  "face_landmark_68_model-weights_manifest.json",
  "face_landmark_68_model-shard1",
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model-shard1",
  "face_recognition_model-shard2",
];

const outputDir = resolve(__dirname, "../public/models");

const download = async (filename) => {
  const url = `${BASE_URL}${filename}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to download ${filename}: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const outputPath = resolve(outputDir, filename);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(arrayBuffer));
  console.log(`Downloaded ${filename}`);
};

const run = async () => {
  console.log(`Downloading face-api.js models to ${outputDir}`);
  for (const file of files) {
    await download(file);
  }
  console.log("Download complete");
};

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
