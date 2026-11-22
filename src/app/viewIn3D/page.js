import Spectrogram3D from "../../components/Spectrogram3D";

export const metadata = {
  title: "3D Spectrogram",
  description: "Your microphone rendered as a live 3D landscape with three.js and custom GLSL shaders.",
};

export default function ViewIn3DPage() {
  return <Spectrogram3D />;
}
