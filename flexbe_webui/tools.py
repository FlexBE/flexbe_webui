
# Copyright 2024 Philipp Schillinger and Christopher Newport University
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Load settings for flexbe_webui."""

import os
from pathlib import Path


def find_subfolder(root, subfolder):
    """Return first subfolder matching the name."""
    for dirpath, dirnames, _ in os.walk(root):
        if subfolder in dirnames:
            return os.path.join(dirpath, subfolder)
    return None


def validate_path_consistency(python_path, manifest_path):
    """Validate that two paths are consistent up to share/lib."""
    path = Path(python_path)
    python_path_elements = [part for part in path.parts if part not in (path.root, path.anchor)]
    path = Path(manifest_path)
    manifest_path_elements = [part for part in path.parts if part not in (path.root, path.anchor)]

    print(f'  Python path: {python_path_elements}')
    print(f'Manifest path: {manifest_path_elements}')

    min_ndx = min(len(python_path_elements), len(manifest_path_elements))
    for ndx in range(min_ndx):
        if python_path_elements[ndx] != manifest_path_elements[ndx]:
            if ndx > 2 and (python_path_elements[ndx - 1] == 'lib' or manifest_path_elements[ndx - 1] == 'share'):
                return True  # Expected breaking point
            print(f'Invalid paths at ndx={ndx}')
            print(f'  Python path: {python_path_elements}')
            print(f'Manifest path: {manifest_path_elements}')
            return False  # Invalid
    return True
