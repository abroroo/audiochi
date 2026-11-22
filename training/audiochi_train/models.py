"""Models: a small CNN student that ships to the browser, and the PANNs CNN14 teacher backbone."""

from __future__ import annotations

import torch
import torch.nn.functional as F
from torch import nn

from . import config as C


def _conv_bn(cin: int, cout: int) -> nn.Sequential:
    return nn.Sequential(
        nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True)
    )


class SmallCNN(nn.Module):
    """~1.2M-parameter VGG-style CNN over log-mel patches.

    Input:  (B, 1, frames, n_mels) log-mel in dB, any number of frames >= 16.
    Output: (B, num_classes) logits. Global mean+max pooling over time makes it length-agnostic,
    so it can be trained on 5 s clips and run live on a shorter sliding window.
    """

    def __init__(self, num_classes: int = C.NUM_CLASSES, widths=(32, 64, 128, 256), dropout=0.3):
        super().__init__()
        self.input_norm = nn.BatchNorm2d(1)
        blocks, cin = [], 1
        for w in widths:
            blocks += [_conv_bn(cin, w), _conv_bn(w, w), nn.AvgPool2d(2)]
            cin = w
        self.features = nn.Sequential(*blocks)
        self.dropout = nn.Dropout(dropout)
        self.embed = nn.Linear(cin, 256)
        self.head = nn.Linear(256, num_classes)

    def embedding(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(self.input_norm(x))  # (B, C, T', M')
        x = x.mean(dim=3)  # pool frequency
        x = x.mean(dim=2) + x.amax(dim=2)  # pool time
        return F.relu(self.embed(self.dropout(x)))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.dropout(self.embedding(x)))


# --- PANNs CNN14 (Kong et al., 2020) -------------------------------------------------------------
# Architecture reproduced from https://github.com/qiuqiangkong/audioset_tagging_cnn so the public
# AudioSet checkpoint (Cnn14_16k_mAP=0.438.pth) loads. Only the embedding path is used here.


class _ConvBlock(nn.Module):
    def __init__(self, cin: int, cout: int):
        super().__init__()
        self.conv1 = nn.Conv2d(cin, cout, 3, padding=1, bias=False)
        self.conv2 = nn.Conv2d(cout, cout, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(cout)
        self.bn2 = nn.BatchNorm2d(cout)

    def forward(self, x, pool_size=(2, 2)):
        x = F.relu_(self.bn1(self.conv1(x)))
        x = F.relu_(self.bn2(self.conv2(x)))
        return F.avg_pool2d(x, pool_size)


class Cnn14Embedder(nn.Module):
    """Log-mel (B, 1, frames, 64) -> 2048-d clip embedding."""

    def __init__(self):
        super().__init__()
        self.bn0 = nn.BatchNorm2d(C.N_MELS)
        self.conv_block1 = _ConvBlock(1, 64)
        self.conv_block2 = _ConvBlock(64, 128)
        self.conv_block3 = _ConvBlock(128, 256)
        self.conv_block4 = _ConvBlock(256, 512)
        self.conv_block5 = _ConvBlock(512, 1024)
        self.conv_block6 = _ConvBlock(1024, 2048)
        self.fc1 = nn.Linear(2048, 2048)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.bn0(x.transpose(1, 3)).transpose(1, 3)
        for i, block in enumerate(
            [self.conv_block1, self.conv_block2, self.conv_block3, self.conv_block4, self.conv_block5]
        ):
            x = block(x)
        x = self.conv_block6(x, pool_size=(1, 1))
        x = x.mean(dim=3)
        x = x.amax(dim=2) + x.mean(dim=2)
        return F.relu_(self.fc1(x))

    @classmethod
    def from_checkpoint(cls, path) -> "Cnn14Embedder":
        model = cls()
        state = torch.load(path, map_location="cpu", weights_only=False)["model"]
        wanted = {k: v for k, v in state.items() if k.split(".")[0] in dict(model.named_children())}
        missing, unexpected = model.load_state_dict(wanted, strict=True), None
        del missing, unexpected
        return model.eval()


def count_params(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())
