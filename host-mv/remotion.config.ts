import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(94);
Config.setCodec("h264");
Config.setOverwriteOutput(true);
Config.setPixelFormat("yuv420p");
Config.setColorSpace("bt709");
// CRF 23 with the slow preset keeps the grain and the red gradients clean at about 2.2 Mbit/s:
// the 3:15 release is 55 MiB, well under GitHub's 100 MB file limit (CRF 20 / medium was 120 MiB)
Config.setCrf(23);
Config.setX264Preset("slow");
Config.setAudioBitrate("192k");

// In sandboxes where Remotion cannot download its own Chrome, point at any Chromium build:
//   REMOTION_BROWSER=/path/to/chrome npm run render
if (process.env.REMOTION_BROWSER) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER);
}
if (process.env.REMOTION_CONCURRENCY) {
  Config.setConcurrency(Number(process.env.REMOTION_CONCURRENCY));
}
