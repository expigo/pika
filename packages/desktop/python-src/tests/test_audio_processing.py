"""
First test coverage for the Python sidecar's audio fingerprinting (`audio_processing.py`).

Scaffold / smoke level: the pure `clamp` is asserted exactly; the librosa-backed extractors are run
on synthetic signals (silence + a pure tone) and checked for their CONTRACT — finite floats in the
documented 0-100 range, `estimate_key` returns a string — rather than exact DSP values (which depend
on librosa internals). This establishes a harness to grow real assertions onto.
"""

import numpy as np
import pytest

from audio_processing import (
    calculate_acousticness,
    calculate_bpm,
    calculate_brightness,
    calculate_danceability,
    calculate_energy,
    calculate_groove,
    clamp,
    estimate_key,
)

SR = 22050


def _tone(freq: float = 440.0, dur: float = 2.0) -> np.ndarray:
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    return (0.3 * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def _silence(dur: float = 2.0) -> np.ndarray:
    return np.zeros(int(SR * dur), dtype=np.float32)


def test_clamp_bounds():
    assert clamp(150.0) == 100.0
    assert clamp(-5.0) == 0.0
    assert clamp(42.0) == 42.0
    assert clamp(42.0, 0.0, 10.0) == 10.0


def test_energy_silence_is_zero_and_tone_is_in_range():
    assert calculate_energy(_silence()) == 0.0
    e = calculate_energy(_tone())
    assert 0.0 < e <= 100.0


@pytest.mark.parametrize(
    "fn",
    [calculate_brightness, calculate_acousticness, calculate_danceability, calculate_groove],
)
def test_fingerprint_metrics_stay_in_0_100(fn):
    val = fn(_tone(), SR)
    assert isinstance(val, float)
    assert 0.0 <= val <= 100.0


def test_estimate_key_returns_a_string():
    key = estimate_key(_tone(), SR)
    assert isinstance(key, str)
    assert len(key) > 0


def test_bpm_is_a_non_negative_float():
    bpm = calculate_bpm(_tone(), SR)
    assert isinstance(bpm, float)
    assert bpm >= 0.0
