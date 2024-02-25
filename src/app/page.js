
import Script from "next/script";
import Head from "next/head";
import Spectrogram from "../components/Spectrograph";

const Home = () => {


  return (
    <div>

      <Head>
        <title>Audio Chi - AI Powered Audio Transcription</title>
        <meta name="description" content="Audio Chi is an AI powered audio transcription service." />


        <meta property="og:url" content="https://audiochi.vercel.app" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Audio Chi - AI Powered Audio Transcription" />
        <meta property="og:description" content="Audio Chi is an AI powered audio transcription service." />
        <meta property="og:image" content="https://audiochi.vercel.app/images/og_image.png" />


        <meta name="twitter:card" content="summary_large_image" />
        <meta property="twitter:domain" content="audiochi.vercel.app" />
        <meta property="twitter:url" content="https://audiochi.vercel.app/" />
        <meta name="twitter:title" content="Audio Chi - AI Powered Audio Transcription" />
        <meta name="twitter:description" content="Audio Chi is an AI powered audio transcription service." />
        <meta name="twitter:image" content="https://audiochi.vercel.app/images/og_image.png" />


      </Head>
      <Spectrogram />

      <Script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.3.1/dist/tf.min.js" />
      <Script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/speech-commands@0.4.0/dist/speech-commands.min.js" />

    </div>
  );
};

export default Home;
