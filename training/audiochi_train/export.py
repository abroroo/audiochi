"""Export the student to ONNX, quantize to int8, verify, benchmark, and ship to the web app.

Steps
  1. Quantization check: export the fold-5 model (never saw fold 5), quantize it with static
     QDQ int8 calibrated on training-fold clips, and compare fp32 vs int8 accuracy on fold 5.
  2. Ship: export + quantize the final model (trained on all folds) into public/models/.
  3. Write labels, model metadata (temperature, window size) and golden vectors that the
     JavaScript log-mel implementation is unit-tested against.
"""

from __future__ import annotations

import time

import numpy as np
import onnx
import onnxruntime as ort
import torch
from onnxruntime.quantization import CalibrationDataReader, QuantFormat, QuantType, quantize_static
from onnxruntime.quantization.shape_inference import quant_pre_process

from . import config as C
from .data import load_esc50
from .features import LogMel, mel_filterbank
from .models import SmallCNN
from .utils import load_json, save_json

LIVE_WINDOW_SECONDS = 2  # browser classifies a sliding 2 s window
LIVE_FRAMES = LIVE_WINDOW_SECONDS * C.SAMPLE_RATE // C.HOP + 1
WORK = C.RUNS_DIR / "export"
GOLDEN = C.ROOT.parent / "src" / "ml" / "__fixtures__" / "logmel_golden.json"


def logmel_np(audio: np.ndarray) -> np.ndarray:
    with torch.no_grad():
        return LogMel()(torch.from_numpy(audio)).numpy()


def export_onnx(state_path, out_path) -> None:
    model = SmallCNN()
    model.load_state_dict(torch.load(state_path, map_location="cpu"))
    model.eval()
    dummy = torch.randn(1, 1, LIVE_FRAMES, C.N_MELS)
    torch.onnx.export(
        model, (dummy,), out_path, input_names=["logmel"], output_names=["logits"],
        dynamic_axes={"logmel": {0: "batch", 2: "frames"}, "logits": {0: "batch"}},
        opset_version=17, dynamo=False,
    )
    onnx.checker.check_model(onnx.load(out_path))


class _Calib(CalibrationDataReader):
    def __init__(self, feats: np.ndarray):
        self._it = iter([{"logmel": f[None]} for f in feats])

    def get_next(self):
        return next(self._it, None)


def quantize(fp32_path, int8_path, calib_feats: np.ndarray) -> None:
    pre = fp32_path.with_suffix(".pre.onnx")
    quant_pre_process(str(fp32_path), str(pre))
    quantize_static(
        str(pre), str(int8_path), _Calib(calib_feats), quant_format=QuantFormat.QDQ,
        per_channel=True, activation_type=QuantType.QUInt8, weight_type=QuantType.QInt8,
    )
    pre.unlink()


def session(path) -> ort.InferenceSession:
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1  # browsers without cross-origin isolation get one thread
    return ort.InferenceSession(str(path), opts, providers=["CPUExecutionProvider"])


def onnx_logits(path, feats: np.ndarray) -> np.ndarray:
    sess = session(path)
    return np.concatenate([sess.run(None, {"logmel": f[None]})[0] for f in feats])


def latency_ms(path, frames=LIVE_FRAMES, runs=200) -> dict:
    sess = session(path)
    x = np.random.randn(1, 1, frames, C.N_MELS).astype(np.float32) * 10 - 40
    for _ in range(20):
        sess.run(None, {"logmel": x})
    times = []
    for _ in range(runs):
        t = time.perf_counter()
        sess.run(None, {"logmel": x})
        times.append((time.perf_counter() - t) * 1000)
    return {"p50": float(np.percentile(times, 50)), "p95": float(np.percentile(times, 95))}


def write_golden() -> None:
    """A deterministic test signal and its log-mel, for the JS front-end parity test."""
    t = np.arange(C.SAMPLE_RATE // 2) / C.SAMPLE_RATE
    rng = np.random.default_rng(7)
    wav = (0.4 * np.sin(2 * np.pi * 440 * t) + 0.2 * np.sin(2 * np.pi * 3100 * t)
           + 0.05 * rng.standard_normal(len(t))).astype(np.float32)
    mel = mel_filterbank()  # (257, 64)
    nz = [(int(np.flatnonzero(col)[0]), col[col != 0].round(8).tolist()) for col in mel.T]
    save_json({
        "sampleRate": C.SAMPLE_RATE, "nFft": C.N_FFT, "hop": C.HOP, "nMels": C.N_MELS,
        "fMin": C.F_MIN, "fMax": C.F_MAX,
        "melBands": [{"start": s, "weights": w} for s, w in nz],
        "wave": wav.round(7).tolist(),
        "logmel": logmel_np(wav[None])[0, 0].round(4).tolist(),
    }, GOLDEN)


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    data = load_esc50()
    train5, test5 = data.split(5)
    rng = np.random.default_rng(C.SEED)
    calib_idx = rng.choice(np.flatnonzero(train5), 200, replace=False)

    # Live-style inputs: the loudest 2 s of each clip, matching how the browser sees audio.
    def live_feats(idx):
        from .augment import random_crop

        crops = random_crop(data.audio[idx], LIVE_WINDOW_SECONDS * C.SAMPLE_RATE, np.random.default_rng(0))
        return logmel_np(crops)

    calib = live_feats(calib_idx)
    full5 = logmel_np(data.audio[test5])
    live5 = live_feats(np.flatnonzero(test5))
    y5 = data.labels[test5]

    fp32_5, int8_5 = WORK / "fold5.fp32.onnx", WORK / "fold5.int8.onnx"
    export_onnx(C.RUNS_DIR / "distill" / "fold5.pt", fp32_5)
    quantize(fp32_5, int8_5, calib)
    check = {}
    for name, path in (("fp32", fp32_5), ("int8", int8_5)):
        check[name] = {
            "fold5_acc_5s": float((onnx_logits(path, full5).argmax(1) == y5).mean()),
            "fold5_acc_live_2s": float((onnx_logits(path, live5).argmax(1) == y5).mean()),
            "size_mb": path.stat().st_size / 1e6,
            "cpu_latency_ms_2s_window": latency_ms(path),
        }
        print(name, check[name])
    torch_logits = np.load(C.RUNS_DIR / "distill" / "test_logits_fold5.npy")
    check["torch_vs_onnx_fp32_max_abs_diff"] = float(np.abs(onnx_logits(fp32_5, full5) - torch_logits).max())

    C.WEB_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    final_fp32 = WORK / "final.fp32.onnx"
    shipped = C.WEB_MODEL_DIR / "audiochi-esc50.int8.onnx"
    export_onnx(C.RUNS_DIR / "distill" / "final.pt", final_fp32)
    quantize(final_fp32, shipped, live_feats(rng.choice(len(data.labels), 300, replace=False)))

    report = load_json(C.REPORTS_DIR / "metrics.json") if (C.REPORTS_DIR / "metrics.json").exists() else {}
    temperature = report.get("calibration", {}).get("temperature", 1.0)
    save_json({
        "model": "audiochi-esc50.int8.onnx", "labels": data.class_names, "temperature": temperature,
        "windowSeconds": LIVE_WINDOW_SECONDS, "sampleRate": C.SAMPLE_RATE, "nFft": C.N_FFT,
        "hop": C.HOP, "nMels": C.N_MELS, "fMin": C.F_MIN, "fMax": C.F_MAX,
        "cvAccuracy": report.get("ablation", {}).get("distill", {}).get("mean_acc"),
    }, C.WEB_MODEL_DIR / "audiochi-esc50.json")
    report["export"] = {**check, "shipped_size_mb": shipped.stat().st_size / 1e6}
    save_json(report, C.REPORTS_DIR / "metrics.json")
    write_golden()
    print(f"shipped {shipped} ({shipped.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
