import numpy as np
import torch
from torchlibrosa.stft import LogmelFilterBank, Spectrogram

from audiochi_train import config as C
from audiochi_train.features import LogMel, num_frames


def test_logmel_matches_panns_front_end():
    """Our plain-torch front end must equal torchlibrosa's, which CNN14 was trained with."""
    torch.manual_seed(0)
    wav = torch.randn(2, C.SAMPLE_RATE) * 0.1
    ref_spec = Spectrogram(n_fft=C.N_FFT, hop_length=C.HOP, win_length=C.N_FFT, window="hann",
                           center=True, pad_mode="reflect", freeze_parameters=True)
    ref_mel = LogmelFilterBank(sr=C.SAMPLE_RATE, n_fft=C.N_FFT, n_mels=C.N_MELS, fmin=C.F_MIN,
                               fmax=C.F_MAX, ref=1.0, amin=C.LOG_AMIN, top_db=None, freeze_parameters=True)
    expected = ref_mel(ref_spec(wav))
    got = LogMel()(wav)
    assert got.shape == expected.shape == (2, 1, num_frames(C.SAMPLE_RATE), C.N_MELS)
    np.testing.assert_allclose(got.numpy(), expected.numpy(), atol=1e-3)


def test_silence_hits_the_floor():
    out = LogMel()(torch.zeros(1, 4000))
    assert torch.allclose(out, torch.full_like(out, 10 * np.log10(C.LOG_AMIN)))
