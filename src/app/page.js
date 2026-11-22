import Script from "next/script";
import Spectrogram from "../components/Spectrogram";

export default function Home() {
  return (
    <>
      <Spectrogram />
      {/* speech-commands needs the tf global, so load TF.js first. */}
      <Script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.3.1/dist/tf.min.js" strategy="afterInteractive" />
      <Script
        src="https://cdn.jsdelivr.net/npm/@tensorflow-models/speech-commands@0.4.0/dist/speech-commands.min.js"
        strategy="afterInteractive"
      />
    </>
  );
}
