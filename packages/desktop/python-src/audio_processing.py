"""
Pika! Audio Processing Module
Contains all librosa-based audio analysis logic.
"""

import os
import sys
from typing import Optional

import librosa
import numpy as np
from pydantic import BaseModel

# Constants
SAMPLE_RATE = 22050
MAX_DURATION = 60  # seconds to analyze

# Key names for pitch class mapping
KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


class AnalysisResult(BaseModel):
    """Result of audio analysis - matches AnalysisResultSchema in @pika/shared."""

    # Core metrics
    bpm: Optional[float] = None
    energy: Optional[float] = None
    key: Optional[str] = None
    
    # Fingerprint metrics (all 0-100 scale)
    danceability: Optional[float] = None
    brightness: Optional[float] = None
    acousticness: Optional[float] = None
    groove: Optional[float] = None
    
    # Error handling
    error: Optional[str] = None


def clamp(value: float, min_val: float = 0.0, max_val: float = 100.0) -> float:
    """Clamp a value between min and max."""
    return max(min_val, min(max_val, value))


def estimate_key(y: np.ndarray, sr: int) -> str:
    """
    Estimate the musical key using chroma features.
    Returns key with major/minor mode (e.g., "Am", "C", "F#m").
    """
    try:
        # Extract chroma features
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        # Sum across time to get pitch class strength
        pitch_class = np.sum(chroma, axis=1)
        # Find the strongest pitch class
        key_idx = int(np.argmax(pitch_class))
        
        # Detect major/minor using third intervals
        major_third_idx = (key_idx + 4) % 12
        minor_third_idx = (key_idx + 3) % 12
        mode = "m" if pitch_class[minor_third_idx] > pitch_class[major_third_idx] else ""
        
        return f"{KEY_NAMES[key_idx]}{mode}"
    except Exception:
        return "Unknown"


def calculate_brightness(y: np.ndarray, sr: int) -> float:
    """
    Calculate brightness using spectral centroid.
    Higher centroid = brighter sound (more treble).
    
    Normalized: mean / 4000 * 100, clamped to 0-100.
    Typical music centroid: 1000-5000 Hz.
    """
    try:
        centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
        mean_centroid = float(np.mean(centroid))
        return clamp((mean_centroid / 4000.0) * 100.0)
    except Exception:
        return 0.0


def calculate_acousticness(y: np.ndarray, sr: int) -> float:
    """
    Calculate acousticness using spectral flatness.
    Low flatness = more tonal/acoustic sounds.
    High flatness = more noisy/electronic sounds.
    
    We invert it: (1 - flatness) * 100, so high = acoustic.
    """
    try:
        flatness = librosa.feature.spectral_flatness(y=y)
        mean_flatness = float(np.mean(flatness))
        return clamp((1.0 - mean_flatness) * 100.0)
    except Exception:
        return 0.0


def calculate_danceability(y: np.ndarray, sr: int) -> float:
    """
    Calculate danceability using tempogram.
    Higher ratio of tempo peak to mean = stronger rhythmic pulse.
    
    A more "danceable" track has a clear, consistent beat.
    """
    try:
        # Get onset envelope for tempo analysis
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempogram = librosa.feature.tempogram(onset_envelope=onset_env, sr=sr)
        
        # Calculate the ratio of max to mean for each tempo band
        tempo_strength = np.mean(tempogram, axis=1)
        if np.mean(tempo_strength) > 0:
            peak_ratio = float(np.max(tempo_strength) / np.mean(tempo_strength))
            # Normalize: typical ratio is 1-10
            return clamp(peak_ratio * 15.0)
        return 50.0  # Default if no tempo detected
    except Exception:
        return 0.0


def calculate_groove(y: np.ndarray, sr: int) -> float:
    """
    Calculate groove using onset strength.
    Higher onset strength = more percussive punch.
    
    Tracks with strong, consistent onsets feel more "groovy".
    """
    try:
        onset_strength = librosa.onset.onset_strength(y=y, sr=sr)
        mean_strength = float(np.mean(onset_strength))
        # Normalize: typical onset strength is 0.5-4.0
        return clamp(mean_strength * 25.0)
    except Exception:
        return 0.0


def calculate_energy(y: np.ndarray) -> float:
    """
    Calculate energy using RMS (Root Mean Square).
    Higher RMS = louder/more intense track.
    
    Normalized to 0-100 scale.
    """
    try:
        rms = librosa.feature.rms(y=y)
        mean_rms = float(np.mean(rms))
        # Normalize: typical RMS for music is 0.01-0.2
        return clamp(mean_rms * 500.0)
    except Exception:
        return 0.0


def calculate_bpm(y: np.ndarray, sr: int) -> float:
    """
    Estimate BPM using librosa's beat tracker.
    """
    try:
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        return float(tempo) if isinstance(tempo, (int, float)) else float(tempo[0])
    except Exception:
        return 0.0


def analyze_audio_file(file_path: str) -> AnalysisResult:
    """
    Analyze an audio file and extract all metrics.
    
    Args:
        file_path: Path to the audio file.
        
    Returns:
        AnalysisResult with all core and fingerprint metrics.
    """
    if not os.path.exists(file_path):
        return AnalysisResult(error=f"File not found: {file_path}")

    try:
        # Load the audio file
        y, sr = librosa.load(file_path, duration=MAX_DURATION, sr=SAMPLE_RATE)
        
        # Check for silence
        if np.max(np.abs(y)) < 0.01:
            return AnalysisResult(error="Audio file appears to be silent")

        # --- Core Metrics ---
        bpm = calculate_bpm(y, sr)
        energy = calculate_energy(y)
        key = estimate_key(y, sr)

        # --- Fingerprint Metrics ---
        brightness = calculate_brightness(y, sr)
        acousticness = calculate_acousticness(y, sr)
        danceability = calculate_danceability(y, sr)
        groove = calculate_groove(y, sr)

        return AnalysisResult(
            # Core
            bpm=round(bpm, 1),
            energy=round(energy, 1),
            key=key,
            # Fingerprint
            danceability=round(danceability, 1),
            brightness=round(brightness, 1),
            acousticness=round(acousticness, 1),
            groove=round(groove, 1),
        )

    except Exception as e:
        print(f"Analysis error: {e}", file=sys.stderr)
        return AnalysisResult(error=str(e))
