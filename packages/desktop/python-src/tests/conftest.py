"""Put the sidecar root (python-src/) on sys.path so tests can `import audio_processing`."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
