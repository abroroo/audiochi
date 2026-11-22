import numpy as np
import torch

from audiochi_train.augment import mixup, random_crop, spec_augment


def test_random_crop_prefers_the_loud_region():
    clip = np.zeros((1, 80_000), np.float32)
    clip[0, 60_000:64_000] = 1.0  # a single loud event near the end
    rng = np.random.default_rng(0)
    crops = np.concatenate([random_crop(clip, 16_000, rng) for _ in range(50)])
    assert crops.shape == (50, 16_000)
    assert (np.abs(crops).sum(axis=1) > 0).mean() > 0.9


def test_spec_augment_masks_with_clip_mean_and_keeps_shape():
    torch.manual_seed(0)
    x = torch.randn(4, 1, 100, 64)
    y = spec_augment(x, time_width=20, freq_width=5)
    assert y.shape == x.shape
    changed = y != x
    assert changed.any()
    means = x.mean(dim=(2, 3), keepdim=True).expand_as(x)
    assert torch.allclose(y[changed], means[changed])


def test_mixup_preserves_probability_mass():
    x = torch.randn(8, 1, 10, 4)
    y = torch.nn.functional.one_hot(torch.arange(8) % 3, 3).float()
    _, ym = mixup(x, y)
    assert torch.allclose(ym.sum(dim=1), torch.ones(8))
