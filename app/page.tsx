"use client";
import FisheyeTextScene from "./components/FisheyeTextScene";

export default function Home() {
  const sampleText =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden">
      {/* Pretty gradient background behind the fisheye scene */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-red-800 via-red-600 to-red-700" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
      </div>

      {/* WebGL fisheye-scene canvas filling the screen */}
      <FisheyeTextScene text={sampleText} speed={54} k={-1} kcube={0.1} />
    </div>
  );
}
