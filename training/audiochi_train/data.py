"""ESC-50 loading: decode, resample to 16 kHz mono, cache as one float16 array."""

from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
import pandas as pd
import soundfile as sf
from scipy.signal import resample_poly
from tqdm import tqdm

from . import config as C


@dataclass(frozen=True)
class Esc50:
    audio: np.ndarray  # (2000, CLIP_SAMPLES) float32 in [-1, 1]
    labels: np.ndarray  # (2000,) int64 class index
    folds: np.ndarray  # (2000,) int64 fold number 1..5
    class_names: list[str]  # index -> human-readable name

    def split(self, test_fold: int) -> tuple[np.ndarray, np.ndarray]:
        """Boolean masks (train, test) for the official 5-fold protocol."""
        test = self.folds == test_fold
        return ~test, test


def _load_wav(path) -> np.ndarray:
    wav, sr = sf.read(path, dtype="float32", always_2d=True)
    wav = wav.mean(axis=1)
    if sr != C.SAMPLE_RATE:
        g = np.gcd(sr, C.SAMPLE_RATE)
        wav = resample_poly(wav, C.SAMPLE_RATE // g, sr // g).astype(np.float32)
    # ESC-50 clips are exactly 5 s; pad/trim guards against off-by-one resampling lengths.
    out = np.zeros(C.CLIP_SAMPLES, dtype=np.float32)
    out[: min(len(wav), C.CLIP_SAMPLES)] = wav[: C.CLIP_SAMPLES]
    return out


def load_esc50() -> Esc50:
    meta_path = C.ESC50_DIR / "meta" / "esc50.csv"
    if not meta_path.exists():
        raise FileNotFoundError(f"ESC-50 not found at {C.ESC50_DIR}. Run `make data` first.")

    meta = pd.read_csv(meta_path).sort_values("filename").reset_index(drop=True)
    cache = C.CACHE_DIR / "esc50_16k.npz"
    if cache.exists():
        audio = np.load(cache)["audio"].astype(np.float32)
    else:
        C.CACHE_DIR.mkdir(parents=True, exist_ok=True)
        audio = np.stack(
            [_load_wav(C.ESC50_DIR / "audio" / f) for f in tqdm(meta.filename, desc="decode ESC-50")]
        )
        np.savez(cache, audio=audio.astype(np.float16))

    names = (
        meta.drop_duplicates("target").sort_values("target").category.str.replace("_", " ").tolist()
    )
    return Esc50(
        audio=audio,
        labels=meta.target.to_numpy(np.int64),
        folds=meta.fold.to_numpy(np.int64),
        class_names=names,
    )


def write_labels(class_names: list[str], path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(class_names, indent=1))
