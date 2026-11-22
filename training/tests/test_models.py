import torch

from audiochi_train import config as C
from audiochi_train.models import SmallCNN, count_params


def test_small_cnn_is_length_agnostic():
    model = SmallCNN().eval()
    for frames in (101, 301, 501):
        out = model(torch.randn(3, 1, frames, C.N_MELS))
        assert out.shape == (3, C.NUM_CLASSES)


def test_small_cnn_fits_the_browser_budget():
    assert count_params(SmallCNN()) < 2_000_000
