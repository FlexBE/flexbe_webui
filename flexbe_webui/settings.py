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

import json
import os
import re
from typing import Any, Dict, List

from ament_index_python import get_package_share_directory

from pydantic import BaseModel, Field, root_validator, validator

DEFAULT_ALLOWED_EDITORS = [
    'gnome-text-editor',
    'code',
    'gedit',
    'kate',
    'geany',
    'subl',
    'sublime_text',
]
ENV_VAR_PATTERN = re.compile(r'\$\{([^}]+)\}')


def get_default_config_file_path() -> str:
    """Return the packaged default JSON configuration path."""
    candidates = []
    try:
        candidates.append(os.path.join(
            get_package_share_directory('flexbe_webui'),
            'config',
            'flexbe_webui_config.json',
        ))
    except (LookupError, OSError, RuntimeError, ValueError):
        pass
    candidates.append(os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        'config',
        'flexbe_webui_config.json',
    ))

    for candidate in candidates:
        resolved_candidate = os.path.realpath(candidate)
        if os.path.exists(resolved_candidate):
            return resolved_candidate

    raise FileNotFoundError('Could not locate packaged flexbe_webui_config.json')


def get_default_license_text(default_license):
    """Get default license text."""
    print(f"loading default license '{default_license}'", flush=True)
    code = ''
    if 'bsd' in default_license.lower():
        code += '# Redistribution and use in source and binary forms, with or without modification,\n'
        code += '# are permitted provided that the following conditions are met:\n'
        code += '#\n'
        code += '#  1. Redistributions of source code must retain the above copyright notice,\n'
        code += '#     this list of conditions and the following disclaimer.\n\n'
        code += '#  2. Redistributions in binary form must reproduce the above copyright notice,\n'
        code += '#     this list of conditions and the following disclaimer in the documentation\n'
        code += '#     and/or other materials provided with the distribution.\n'
        code += '#\n'
        code += '#  3. Neither the name of the copyright holder nor the names of its\n'
        code += '#     contributors may be used to endorse or promote products derived from\n'
        code += '#     this software without specific prior written permission.\n'
        code += '#\n'
        code += '# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS “AS IS”\n'
        code += '# AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,\n'
        code += '# THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE\n'
        code += '# ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE\n'
        code += '# FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES\n'
        code += '# (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;\n'
        code += '# LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND\n'
        code += '# ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR\n'
        code += '# TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF\n'
        code += '# THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\n'
    else:
        # Default to Apache 2
        code += '# Licensed under the Apache License, Version 2.0 (the "License");\n'
        code += '# you may not use this file except in compliance with the License.\n'
        code += '# You may obtain a copy of the License at\n'
        code += '#\n'
        code += '#     http://www.apache.org/licenses/LICENSE-2.0\n'
        code += '#\n'
        code += '# Unless required by applicable law or agreed to in writing, software\n'
        code += '# distributed under the License is distributed on an "AS IS" BASIS,\n'
        code += '# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n'
        code += '# See the License for the specific language governing permissions and\n'
        code += '# limitations under the License.\n'
    return code


class WebuiSettings(BaseModel):
    """Typed, validated settings model for flexbe_webui."""

    class Config:
        """Ignore unknown fields from legacy/external config files."""

        extra = 'ignore'

    code_indentation: int = 2
    collapse_info: bool = True
    collapse_warn: bool = True
    collapse_error: bool = False
    collapse_hint: bool = False
    commands_enabled: bool = False
    commands_key: str = 'FlexBE WebUI'
    default_package: str = 'flexbe_behaviors'
    dashboard_text_size: float = 86.5
    dashboard_text_bold: bool = False
    statemachine_text_size: float = 86.5
    statemachine_text_bold: bool = True
    statemachine_text_extra_bold: bool = False
    sidepanel_width: int = 350
    feed_panel_width: int = 270
    terminal_height: int = 30
    rc_right_panel_width: int = 34
    transition_line_width_normal: float = 2.0
    transition_line_width_bold: float = 3.0
    transition_line_width_extra_bold: float = 4.0
    allow_editors: List[str] = Field(default_factory=lambda: DEFAULT_ALLOWED_EDITORS.copy())
    editor_command: str = 'gnome-text-editor -s $FILE'
    explicit_states: bool = False
    gridsize: int = 50
    initialize_flexbe_core: bool = True
    license: str = 'bsd-3'  # noqa: A003
    license_file: str = ''
    pkg_cache_enabled: bool = False
    runtime_timeout: int = 10
    server_timeout: float = 0.25
    save_in_source: bool = True
    source_code_root: str = '${WORKSPACE_ROOT}/src'
    stop_behaviors: bool = False
    structured_request_logging: bool = True
    synthesis_enabled: bool = False
    synthesis_topic: str = '/behavior_synthesis'
    synthesis_type: str = 'synthesis_msgs/BehaviorSynthesisAction'
    synthesis_system: str = 'system_wide'
    target_line_length: int = 100
    text_encoding: str = 'UTF-8'
    transition_mode: int = 1
    visualize_whitespace: bool = True
    license_text: str = ''

    @validator('allow_editors', pre=True)
    def _normalize_allow_editors(cls, value: Any) -> List[str]:
        """Normalize editor allowlist input and enforce defaults."""
        if not isinstance(value, list):
            value = DEFAULT_ALLOWED_EDITORS

        normalized = []
        for editor in value:
            if isinstance(editor, str):
                name = editor.strip()
                if name != '':
                    normalized.append(name)

        if len(normalized) == 0:
            return DEFAULT_ALLOWED_EDITORS.copy()
        return normalized

    @validator('dashboard_text_size', 'statemachine_text_size', pre=True)
    def _normalize_text_size(cls, value: Any) -> float:
        """Ensure UI text size settings stay in a reasonable range."""
        try:
            size = float(value)
        except (TypeError, ValueError):
            size = 86.5
        if size < 50.0:
            return 50.0
        if size > 150.0:
            return 150.0
        return size

    @validator('sidepanel_width', pre=True)
    def _normalize_sidepanel_width(cls, value: Any) -> int:
        """Keep properties panel width in a reasonable range."""
        try:
            width = int(value)
        except (TypeError, ValueError):
            width = 350
        return max(200, min(700, width))

    @validator('feed_panel_width', pre=True)
    def _normalize_feed_panel_width(cls, value: Any) -> int:
        """Keep notification feed width in a reasonable range."""
        try:
            width = int(value)
        except (TypeError, ValueError):
            width = 270
        return max(150, min(500, width))

    @validator('terminal_height', pre=True)
    def _normalize_terminal_height(cls, value: Any) -> int:
        """Keep terminal panel height percentage in a reasonable range."""
        try:
            height = int(value)
        except (TypeError, ValueError):
            height = 30
        return max(15, min(70, height))

    @validator('rc_right_panel_width', pre=True)
    def _normalize_rc_right_panel_width(cls, value: Any) -> int:
        """Keep runtime control right panel percentage in a reasonable range."""
        try:
            width = int(value)
        except (TypeError, ValueError):
            width = 34
        return max(20, min(60, width))

    @validator('server_timeout', pre=True)
    def _normalize_server_timeout(cls, value: Any) -> float:
        """Keep short server wait timeouts in a sensible range."""
        try:
            timeout = float(value)
        except (TypeError, ValueError):
            print(f"\x1b[93mInvalid server_timeout '{value}', using default 0.25s\x1b[0m", flush=True)
            return 0.25
        if timeout < 0.05:
            print(f'\x1b[93mserver_timeout {timeout}s is below minimum, clamping to 0.05s\x1b[0m', flush=True)
            return 0.05
        if timeout > 10.0:
            print(f'\x1b[93mserver_timeout {timeout}s exceeds maximum, clamping to 10.0s\x1b[0m', flush=True)
            return 10.0
        return round(timeout, 2)

    @validator('transition_line_width_normal', 'transition_line_width_bold',
               'transition_line_width_extra_bold', pre=True)
    def _normalize_transition_line_width(cls, value: Any) -> float:
        """Ensure transition line widths remain in a usable range."""
        try:
            width = float(value)
        except (TypeError, ValueError):
            width = 2.0
        if width < 1.0:
            return 1.0
        if width > 20.0:
            return 20.0
        return width

    @root_validator(skip_on_failure=True)
    def _normalize_transition_line_width_order(cls, values: Dict[str, Any]):
        """Keep transition widths ordered: normal < bold < extra bold."""
        epsilon = 0.1
        normal = float(values.get('transition_line_width_normal', 2.0))
        bold = float(values.get('transition_line_width_bold', 3.0))
        extra = float(values.get('transition_line_width_extra_bold', 4.0))

        normal = min(max(normal, 1.0), 19.8)
        bold = min(max(bold, 1.1), 19.9)
        extra = min(max(extra, 1.2), 20.0)

        if bold <= normal:
            bold = min(19.9, normal + epsilon)
        if extra <= bold:
            extra = min(20.0, bold + epsilon)

        if extra <= bold:
            extra = 20.0
            bold = min(bold, 19.9)
            if bold <= normal:
                normal = max(1.0, bold - epsilon)

        values['transition_line_width_normal'] = round(normal, 1)
        values['transition_line_width_bold'] = round(bold, 1)
        values['transition_line_width_extra_bold'] = round(extra, 1)
        return values

    @validator('license_file', 'source_code_root', pre=True)
    def _normalize_string_fields(cls, value: Any) -> str:
        """Ensure path-like settings are always normalized strings."""
        if value is None:
            return ''
        return str(value)

    @root_validator(skip_on_failure=True)
    def _resolve_paths_and_license(cls, values: Dict[str, Any]):
        """Apply source path and license-file dependent settings."""
        save_in_source = bool(values.get('save_in_source', False))
        source_code_root = values.get('source_code_root', '')

        if save_in_source and '${' in source_code_root:
            matches = ENV_VAR_PATTERN.findall(source_code_root)
            if len(matches) > 0:
                workspace_root = os.getenv(matches[0])
                if workspace_root is not None and workspace_root.strip() != '':
                    print(f"The '{matches[0]}' environment variable is set, update the source code root.", flush=True)
                    source_code_root = source_code_root.replace(f'${{{matches[0]}}}', workspace_root)
                    values['source_code_root'] = source_code_root
                    print(source_code_root, flush=True)
                else:
                    print(f"The '{matches[0]}' environment variable is NOT set!  Cannot update the source code root.",
                          flush=True)
                    values['save_in_source'] = False
                    save_in_source = False

        if save_in_source and not os.path.exists(source_code_root):
            print(f"The '{source_code_root}' directory does not exist!"
                  f'  Cannot save behaviors in the source code root.', flush=True)
            values['save_in_source'] = False

        license_name = str(values.get('license', 'bsd-3'))
        values['license_text'] = get_default_license_text(license_name)
        license_file = str(values.get('license_file', ''))
        if license_file != '':
            if os.path.exists(license_file):
                with open(license_file) as fin:
                    lines = [f'{line.strip()}' if line.strip().startswith('#')
                             else f'# {line.strip()}' for line in fin.readlines()]
                    values['license_text'] = '\n'.join(lines) + '\n'
                    print(f"Using custom license text:\n{values['license_text']}\n", flush=True)
            else:
                print(f"Cannot load custom license text from '{license_file}'"
                      f'  use default license:\n{license_name}\n', flush=True)
        return values


def update_settings(settings: Dict[str, Any]):
    """Validate and normalize settings via typed model."""
    validated = WebuiSettings.parse_obj(settings)
    return validated.dict()


def load_settings(json_dict=None):
    """Load settings for the flexbe_webui."""
    settings: Dict[str, Any] = {}

    if json_dict is not None:
        if 'file_name' in json_dict:
            file_path = os.path.join(json_dict['folder_path'], json_dict['file_name'])
            print(f"Load configuration settings from '{file_path}'", flush=True)
            if not os.path.exists(file_path):
                raise FileNotFoundError(f'The file {file_path} does not exist.')
            try:
                with open(file_path, 'r') as fin:
                    json_settings = json.load(fin)
                if not isinstance(json_settings, dict):
                    raise ValueError(f"Configuration file '{file_path}' must contain a JSON object.")
                settings.update(json_settings)
            except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
                print('\x1b[91m Failed to load settings!\x1b[0m', flush=True)
                raise exc
        else:
            print('\x1b[93mNo file name provided - using default FlexBE configuration.\x1b[0m', flush=True)
    else:
        file_path = get_default_config_file_path()
        print(f"Load default configuration settings from '{file_path}'", flush=True)
        try:
            with open(file_path, 'r') as fin:
                json_settings = json.load(fin)
            if not isinstance(json_settings, dict):
                raise ValueError(f"Configuration file '{file_path}' must contain a JSON object.")
            settings.update(json_settings)
        except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
            print('\x1b[91m Failed to load default settings!\x1b[0m', flush=True)
            raise exc

    return update_settings(settings)
