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


def update_settings(settings):
    """Update settings using custom data as needed."""
    if settings['save_in_source']:
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
                settings['save_in_source'] = False

        if settings['save_in_source'] and not os.path.exists(settings['source_code_root']):
            print(f"The '{settings['source_code_root']}' directory does not exist!"
                  f'  Cannot save behaviors in the source code root.', flush=True)
            settings['save_in_source'] = False

    # Define license text to use in saved behaviors
    settings['license_text'] = get_default_license_text(settings['license'])
    if settings['license_file'] is not None and settings['license_file'] != '':
        if os.path.exists(settings['license_file']):
            with open(settings['license_file']) as fin:
                lines = [f'{line.strip()}' if line.strip().startswith('#') else f'# {line.strip()}' for line in fin.readlines()]
                settings['license_text'] = '\n'.join(lines) + '\n'
                print(f"Using custom license text:\n{settings['license_text']}\n", flush=True)
        else:
            print(f"Cannot load custom license text from '{settings['license_file']}'"
                  f"  use default license:\n{settings['license']}\n", flush=True)

    return settings


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
        'commands_key': 'FlexBE WebUI',
        'default_package': 'flexbe_behaviors',
        'editor_command': 'gedit --new-window $FILE +$LINE',
        'explicit_states': False,
        'gridsize': 50,
        'initialize_flexbe_core': True,  # Use latest initialization code
        'license': 'bsd-3',               # Allow Apache-2, BSD-3, or Custom
        'license_file': '',              # or, full file path to custom license file
        'pkg_cache_enabled': False,
        'runtime_timeout': 10,
        'save_in_source': False,  # Save behaviors source code folders as well as install folder
        'source_code_root': '${WORKSPACE_ROOT}/src',
        'stop_behaviors': False,  # restrict execution (stop externally started behaviors)
        'synthesis_enabled': False,
        'synthesis_topic': '/behavior_synthesis',
        'synthesis_type': 'synthesis_msgs/BehaviorSynthesisAction',
        'synthesis_system': 'system_wide',
        'target_line_length': 100,
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

    update_settings(settings)
    return settings
