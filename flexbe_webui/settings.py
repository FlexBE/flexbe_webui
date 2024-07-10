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


def load_settings(json_dict=None):
    """Load settings for the flexbe_webui."""
    # default settings
    settings = {
        'code_indentation': 2,
        'collapse_info': True,
        'collapse_warn': True,
        'collapse_error': False,
        'collapse_hint': False,
        'commands_enabled': False,
        'commands_key': '',
        'default_package': 'flexbe_behaviors',
        'editor_command': 'gedit --new-window $FILE +$LINE',
        'explicit_states': False,
        'gridsize': 50,
        'pkg_cache_enabled': False,
        'runtime_timeout': 10,
        'save_in_source': True,   # Save behaviors in install and source code folders
        'source_code_root': '${WORKSPACE_ROOT}/src',
        'stop_behaviors': False,  # restrict execution (stop externally started behaviors)
        'synthesis_enabled': False,
        'synthesis_topic': '/behavior_synthesis',
        'synthesis_type': 'synthesis_msgs/BehaviorSynthesisAction',
        'synthesis_system': 'system_wide',
        'text_encoding': 'UTF-8',
        'transition_mode': 1,
        'visualize_whitespace': True,
    }

    if json_dict is not None:
        if 'file_name' in json_dict:
            file_path = os.path.join(json_dict['folder_path'], json_dict['file_name'])
            print(f"Load configuration settings from '{file_path}'", flush=True)
            if not os.path.exists(file_path):
                raise FileNotFoundError(f'The file {file_path} does not exist.')
            try:
                with open(file_path, 'r') as fin:
                    json_settings = json.load(fin)
                settings.update(json_settings)
            except Exception as exc:
                print('\x1b[91m Failed to load settings!\x1b[0m', flush=True)
                raise exc
        else:
            print('\x1b[93mNo file name provided - using default FlexBE configuration.\x1b[0m', flush=True)
    else:
        print('using default FlexBE WebUI configuration.', flush=True)

    if '${' in settings['source_code_root']:
        # Allow environment variable in file specification"""
        pattern = r'\$\{([^}]+)\}'
        matches = re.findall(pattern, settings['source_code_root'])
        workspace_root = os.getenv(matches[0])

        # Check if the environment variable is found
        if workspace_root is not None:
            print(f"The '{matches[0]}' environment variable is set, update the source code root.", flush=True)
            # Replace the placeholder with the value of the environment variable
            settings['source_code_root'] = settings['source_code_root'].replace(f'${{{matches[0]}}}', workspace_root)
            print(settings['source_code_root'], flush=True)
        else:
            print(f"The '{matches[0]}' environment variable is NOT set!  Cannot update the source code root.", flush=True)

    return settings
