"""Shared constants. The browser front end (src/ml/logmel.js) must use the same values."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / ".data"
ESC50_DIR = DATA_DIR / "ESC-50-master"
CACHE_DIR = DATA_DIR / "cache"
RUNS_DIR = ROOT / "runs"
REPORTS_DIR = ROOT / "reports"
WEB_MODEL_DIR = ROOT.parent / "public" / "models"

# Audio front end. These match PANNs CNN14 (16 kHz variant) so teacher and student see the same features.
SAMPLE_RATE = 16_000
CLIP_SECONDS = 5
CLIP_SAMPLES = SAMPLE_RATE * CLIP_SECONDS
N_FFT = 512  # 32 ms Hann window
HOP = 160  # 10 ms hop -> 100 frames / second
N_MELS = 64
F_MIN = 50.0
F_MAX = 8_000.0
LOG_AMIN = 1e-10  # power floor before 10*log10

NUM_CLASSES = 50
FOLDS = (1, 2, 3, 4, 5)
SEED = 1337
