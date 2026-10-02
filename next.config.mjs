/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // Lets a second dev/build run (e.g. automated screenshots) use its own output dir.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["nfc-pcsc", "@pokusew/pcsclite"],
};
export default nextConfig;
