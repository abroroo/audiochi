"""Log-mel front end.

Implemented with plain torch ops (not torchlibrosa) so the exact same math can be ported to
JavaScript: reflect-padded STFT with a periodic Hann window -> power -> Slaney mel filterbank ->
10*log10. `tests/test_features.py` checks it against torchlibrosa (the PANNs front end), and
`export.py` writes the filterbank + golden vectors that the browser implementation is tested against.
"""

from __future__ import annotations

import librosa
import numpy as np
import torch
from torch import nn

from . import config as C


def mel_filterbank() -> np.ndarray:
    """(n_fft // 2 + 1, n_mels) Slaney-normalized mel weights, as used by librosa and PANNs."""
    return librosa.filters.mel(
        sr=C.SAMPLE_RATE, n_fft=C.N_FFT, n_mels=C.N_MELS, fmin=C.F_MIN, fmax=C.F_MAX
    ).T.astype(np.float32)


class LogMel(nn.Module):
    """Waveform (B, samples) -> log-mel (B, 1, frames, n_mels) in dB."""

    def __init__(self) -> None:
        super().__init__()
        self.register_buffer("window", torch.hann_window(C.N_FFT, periodic=True), persistent=False)
        self.register_buffer("mel", torch.from_numpy(mel_filterbank()), persistent=False)

    def forward(self, wav: torch.Tensor) -> torch.Tensor:
        spec = torch.stft(
            wav,
            n_fft=C.N_FFT,
            hop_length=C.HOP,
            window=self.window,
            center=True,
            pad_mode="reflect",
            return_complex=True,
        )
        power = spec.real.pow(2) + spec.imag.pow(2)  # (B, freq, frames)
        mel = torch.matmul(power.transpose(1, 2), self.mel)  # (B, frames, n_mels)
        logmel = 10.0 * torch.log10(torch.clamp(mel, min=C.LOG_AMIN))
        return logmel.unsqueeze(1)


def num_frames(samples: int) -> int:
    return samples // C.HOP + 1
