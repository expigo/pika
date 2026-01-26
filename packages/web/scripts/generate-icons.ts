import fs from "fs";
import path from "path";
import sharp from "sharp";

const INPUT_FILE = path.join(process.cwd(), "public", "logo.jpg");
const PUBLIC_DIR = path.join(process.cwd(), "public");

async function generateIcons() {
  console.log("🎨 Generating PWA Icons from logo.jpg...");

  if (!fs.existsSync(INPUT_FILE)) {
    console.error("❌ Error: public/logo.jpg not found!");
    process.exit(1);
  }

  // standard icons (no padding)
  await sharp(INPUT_FILE).resize(192, 192).toFile(path.join(PUBLIC_DIR, "icon-192.png"));
  console.log("✅ Generated icon-192.png");

  await sharp(INPUT_FILE).resize(512, 512).toFile(path.join(PUBLIC_DIR, "icon-512.png"));
  console.log("✅ Generated icon-512.png");

  // maskable icons (add padding to be safe for round crops)
  // Maskable icons should have the logo in the center ~60-80%, with background extending to edges.
  // We'll resize the logo to 80% of the target size and composite it over a background.

  // Get dominant color/background color from the image edges or meta
  // For Pika! we know the theme is #0a0a0a
  const BACKGROUND_COLOR = "#0a0a0a";

  const maskableBuffer = await sharp(INPUT_FILE)
    .resize(409, 409, { fit: "contain", background: BACKGROUND_COLOR }) // 80% of 512
    .extend({
      top: 51,
      bottom: 52,
      left: 51,
      right: 52,
      background: BACKGROUND_COLOR,
    })
    .resize(512, 512)
    .toBuffer();

  await sharp(maskableBuffer).toFile(path.join(PUBLIC_DIR, "icon-maskable-512.png"));
  console.log("✅ Generated icon-maskable-512.png (with padding)");

  // We also need to update manifest to point to this new maskable icon
  console.log(
    "⚠️  REMINDER: Update manifest.json to use icon-maskable-512.png for purpose: 'maskable'",
  );
}

generateIcons().catch(console.error);
