"""Which score best tells "not one of the 50 classes" apart from ESC-50 sounds?

In-distribution: a random (not loudest) 2 s window of every ESC-50 clip, near-silent ones skipped.
Out-of-distribution, generated locally so no extra download is needed:
  speech  macOS text-to-speech, 12 voices x 3 sentences (.data/ood/speech_*.wav, see Makefile)
  tonal   pure tones, chords, melodies, square waves, chirps

The winner's threshold (KEEP_KNOWN% of ESC-50 windows kept as known) is written to the model metadata,
and the app uses it. Result and the honest story are in training/README.md.

Scores (higher = more likely unknown), all from the shipped int8 ONNX model:
  msp          1 - max softmax probability (Hendrycks & Gimpel, 2017)
  energy       -logsumexp(logits) (Liu et al., 2020)
  knn_embed    k-th NN cosine distance in the 256-d penultimate embedding (Sun et al., 2022)
  knn_pooled   same on the pooled conv features before the embedding layer

    uv run python -m audiochi_train.ood_study
"""

from __future__ import annotations

import numpy as np
import onnx
import onnxruntime as ort
import soundfile as sf
from scipy.special import logsumexp, softmax
from sklearn.metrics import roc_auc_score

import json

from . import config as C
from .data import load_esc50
from .export import logmel_np
from .utils import save_json

K = 10
KEEP_KNOWN = 90  # percent of ESC-50 windows that must stay "known"; see energy_tradeoff in the report
WIN = 2 * C.SAMPLE_RATE
POOLED = "/Add_output_0_DequantizeLinear_Output"
SHIPPED = C.WEB_MODEL_DIR / "audiochi-esc50.int8.onnx"


def unit(x):
    return x / np.maximum(np.linalg.norm(x, axis=-1, keepdims=True), 1e-12)


def session():
    m = onnx.load(SHIPPED)
    if not any(o.name == POOLED for o in m.graph.output):
        m.graph.output.append(onnx.helper.make_tensor_value_info(POOLED, onnx.TensorProto.FLOAT, ["batch", 256]))
    return ort.InferenceSession(m.SerializeToString(), providers=["CPUExecutionProvider"])


def run(sess, waves):
    outs = [sess.run(["logits", "embedding", POOLED], {"logmel": logmel_np(waves[i:i + 50])})
            for i in range(0, len(waves), 50)]
    return [np.concatenate(o) for o in zip(*outs)]


def loud_mask(waves):
    return 10 * np.log10((waves ** 2).mean(1) + 1e-12) > -55


def loud(waves):
    return waves[loud_mask(waves)]


def tonal_set(rng, n=120):
    t = np.arange(WIN) / C.SAMPLE_RATE
    out = []
    for i in range(n):
        f = rng.uniform(150, 2500)
        kind = i % 5
        if kind == 0:
            x = np.sin(2 * np.pi * f * t)
        elif kind == 1:
            x = sum(np.sin(2 * np.pi * f * r * t) for r in (1, 1.26, 1.5))
        elif kind == 2:
            x = np.sign(np.sin(2 * np.pi * f * t))
        elif kind == 3:
            x = np.sin(2 * np.pi * (f + f * 0.5 * t) * t)
        else:  # melody: 8 plucked notes with harmonics
            x = np.zeros_like(t)
            seg = WIN // 8
            for j in range(8):
                g = f * 2 ** (rng.integers(0, 12) / 12)
                s = np.arange(seg) / C.SAMPLE_RATE
                x[j * seg:(j + 1) * seg] = sum(np.sin(2 * np.pi * g * k * s) / k for k in range(1, 6)) * np.exp(-6 * s)
        out.append(0.2 * x / np.abs(x).max())
    return np.stack(out).astype(np.float32)


def speech_set(return_voice=False):
    waves, voice = [], []
    for p in sorted((C.DATA_DIR / "ood").glob("speech_*.wav"), key=lambda q: int(q.stem.split("_")[1])):
        a, sr = sf.read(p, dtype="float32")
        assert sr == C.SAMPLE_RATE
        a = 0.3 * a / np.abs(a).max()
        for s in range(0, len(a) - WIN + 1, WIN // 2):
            waves.append(a[s:s + WIN])
            voice.append(int(p.stem.split("_")[1]) // 3)  # 3 sentences per voice
    waves, voice = np.stack(waves), np.array(voice)
    m = loud_mask(waves)
    return (waves[m], voice[m]) if return_voice else waves[m]


def main():
    rng = np.random.default_rng(3)
    data = load_esc50()
    starts = rng.integers(0, data.audio.shape[1] - WIN, len(data.audio))
    audio = data.audio.astype(np.float32)
    all_waves = np.stack([a[s:s + WIN] for a, s in zip(audio, starts)])
    keep = loud_mask(all_waves)
    id_clip = np.flatnonzero(keep)  # which clip each in-distribution window came from

    from .augment import random_crop
    sess = session()
    # Reference bank exactly as the browser has it: loudest 2 s of every clip (index = clip id).
    bank = run(sess, random_crop(data.audio, WIN, np.random.default_rng(0)))
    sets = {"esc50": run(sess, all_waves[keep]), "speech": run(sess, speech_set()), "tonal": run(sess, tonal_set(rng))}

    # Browser pipeline for the embedding: unit -> PCA-64 -> unit, int8 bank.
    sp = json.loads((C.WEB_MODEL_DIR / "audiochi-esc50.space.json").read_text())
    mean, comps = np.array(sp["mean"]), np.array(sp["components"]).reshape(sp["dims"], -1)
    import base64
    zbank = np.frombuffer(base64.b64decode(sp["vectors"]["data"]), np.int8).reshape(sp["count"], -1) / 127.0

    def proj(e):
        return unit((unit(e) - mean) @ comps.T)

    def scores(logits, emb, pooled, self_clip=None):
        out = {"msp": 1 - softmax(logits, 1).max(1), "energy": -logsumexp(logits, 1)}
        for name, sims in (("knn_embed", proj(emb) @ zbank.T), ("knn_pooled", unit(pooled) @ unit(bank[2]).T)):
            if self_clip is not None:  # a clip must not match another window of itself
                sims[np.arange(len(sims)), self_clip] = -np.inf
            out[name] = 1 - np.sort(sims, 1)[:, -K]
        return out

    s = {k: scores(*v, self_clip=id_clip if k == "esc50" else None) for k, v in sets.items()}
    report_thr = float(np.percentile(s["esc50"]["knn_embed"], 95))
    report = {"n": {k: len(v[0]) for k, v in sets.items()}, "auroc": {}, "tpr95_fpr": {}}
    for score in s["esc50"]:
        thr = np.percentile(s["esc50"][score], 95)  # keep 95% of ESC-50 windows as known
        for ood in ("speech", "tonal"):
            y = np.r_[np.zeros(len(s["esc50"][score])), np.ones(len(s[ood][score]))]
            report["auroc"][f"{score}/{ood}"] = round(float(roc_auc_score(y, np.r_[s["esc50"][score], s[ood][score]])), 3)
            report["tpr95_fpr"][f"{score}/{ood}"] = round(float((s[ood][score] > thr).mean()), 3)
    top = {k: np.bincount(softmax(v[0], 1).argmax(1), minlength=50) for k, v in sets.items() if k != "esc50"}
    report["top_predictions"] = {k: {data.class_names[i]: int(c) for i, c in
                                     sorted(enumerate(v), key=lambda x: -x[1])[:4]} for k, v in top.items()}
    report["knn_embed_threshold_95"] = round(report_thr, 4)
    report["caveat"] = "Shipped model trained on all ESC-50 clips: in-distribution scores are in-sample."
    # Built-in "speech" prototype: a reject class learned like a taught sound (mean embedding).
    # Fit on 6 voices, test on the other 6 and on all ESC-50 windows.
    sp_waves, sp_voice = speech_set(return_voice=True)
    z_sp = proj(run(sess, sp_waves)[1])
    z_id = proj(sets["esc50"][1])
    cents = np.array(sp["centroids"]).reshape(50, -1)
    fit = sp_voice < 6
    proto = unit(z_sp[fit].mean(0))

    def is_speech(z):
        return (z @ proto) > (z @ cents.T).max(1)

    esc_hits = is_speech(z_id)
    id_labels = data.labels[id_clip]
    report["speech_prototype"] = {
        "heldout_voices_caught": round(float(is_speech(z_sp[~fit]).mean()), 3),
        "esc50_windows_called_speech": round(float(esc_hits.mean()), 4),
        "esc50_classes_most_called_speech": {data.class_names[c]: int(n) for c, n in
                                             sorted(enumerate(np.bincount(id_labels[esc_hits], minlength=50)),
                                                    key=lambda x: -x[1])[:4] if n},
    }
    sp["speechPrototype"] = np.round(unit(z_sp.mean(0)).astype(np.float64), 4).tolist()  # ship: all voices
    (C.WEB_MODEL_DIR / "audiochi-esc50.space.json").write_text(json.dumps(sp, separators=(",", ":")))

    # Trade-off curve for the shipped score: how many real sounds get wrongly called unknown.
    report["energy_tradeoff"] = []
    for keep in (80, 85, 90, 95):
        t = float(np.percentile(s["esc50"]["energy"], keep))
        report["energy_tradeoff"].append({
            "esc50_kept_as_known": keep / 100, "threshold": round(t, 3),
            "speech_caught": round(float((s["speech"]["energy"] > t).mean()), 3),
            "tonal_caught": round(float((s["tonal"]["energy"] > t).mean()), 3)})

    # Ship the winner: energy, thresholded to keep KEEP_KNOWN% of ESC-50 windows as known.
    energy_thr = float(np.percentile(s["esc50"]["energy"], KEEP_KNOWN))
    report["shipped"] = {"score": "energy", "threshold": round(energy_thr, 4), "esc50_kept_as_known": KEEP_KNOWN / 100,
                         "speech_caught": round(float((s["speech"]["energy"] > energy_thr).mean()), 3),
                         "tonal_caught": round(float((s["tonal"]["energy"] > energy_thr).mean()), 3)}
    meta_path = C.WEB_MODEL_DIR / "audiochi-esc50.json"
    meta = json.loads(meta_path.read_text())
    meta["unknownEnergyThreshold"] = round(energy_thr, 4)
    save_json(meta, meta_path)
    save_json(report, C.REPORTS_DIR / "ood_study.json")
    print(report)


if __name__ == "__main__":
    main()
