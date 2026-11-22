"""Augmentations: waveform crop/gain/shift, SpecAugment masking, and mixup."""

from __future__ import annotations

import numpy as np
import torch


def random_crop(batch: np.ndarray, samples: int, rng: np.random.Generator, hop: int = 1600) -> np.ndarray:
    """Crop each clip to `samples`, biased toward the loudest region.

    Many ESC-50 clips are short events padded with silence; a uniform crop would often
    contain nothing. The crop start is sampled with probability proportional to window energy.
    """
    n, total = batch.shape
    if samples >= total:
        return batch
    csum = np.concatenate([np.zeros((n, 1)), np.cumsum(np.square(batch, dtype=np.float64), axis=1)], axis=1)
    starts = np.arange(0, total - samples + 1, hop)
    energy = csum[:, starts + samples] - csum[:, starts] + 1e-6  # (n, len(starts))
    cdf = np.cumsum(energy / energy.sum(axis=1, keepdims=True), axis=1)
    picks = (cdf < rng.random((n, 1))).sum(axis=1).clip(max=len(starts) - 1)
    offsets = starts[picks][:, None] + np.arange(samples)
    return np.take_along_axis(batch, offsets, axis=1)


def random_gain(batch: np.ndarray, rng: np.random.Generator, db: float = 6.0) -> np.ndarray:
    gains = 10 ** (rng.uniform(-db, db, size=(len(batch), 1)) / 20)
    return (batch * gains).astype(np.float32)


def _band_mask(b: int, size: int, n_masks: int, width: int, device) -> torch.Tensor:
    """(b, size) bool mask with up to `n_masks` random bands of width <= `width` per row."""
    pos = torch.arange(size, device=device)
    mask = torch.zeros(b, size, dtype=torch.bool, device=device)
    for _ in range(n_masks):
        w = torch.randint(0, width + 1, (b, 1), device=device)
        s = (torch.rand(b, 1, device=device) * (size - w).clamp(min=1)).long()
        mask |= (pos >= s) & (pos < s + w)
    return mask


def spec_augment(x: torch.Tensor, time_masks=2, time_width=40, freq_masks=2, freq_width=8) -> torch.Tensor:
    """SpecAugment on (B, 1, T, M) log-mel; masked cells are set to each clip's mean."""
    b, _, t, m = x.shape
    tmask = _band_mask(b, t, time_masks, time_width, x.device)[:, None, :, None]
    fmask = _band_mask(b, m, freq_masks, freq_width, x.device)[:, None, None, :]
    fill = x.mean(dim=(2, 3), keepdim=True)
    return torch.where(tmask | fmask, fill, x)


def mixup(x: torch.Tensor, y: torch.Tensor, alpha: float = 0.4):
    """Mix pairs of examples. `y` is a (B, C) probability target; returns mixed (x, y)."""
    lam = float(np.random.beta(alpha, alpha))
    perm = torch.randperm(x.shape[0], device=x.device)
    return lam * x + (1 - lam) * x[perm], lam * y + (1 - lam) * y[perm]
