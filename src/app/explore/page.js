import SoundMap3D from "../../components/SoundMap3D";

export const metadata = {
  title: "Sound map",
  description: "Fly through the embedding space of Audiochi's sound model in 3D and see where your own sound lands.",
};

export default function ExplorePage() {
  return <SoundMap3D />;
}
