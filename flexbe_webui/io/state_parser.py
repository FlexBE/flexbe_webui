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

"""State parser."""

import importlib
import inspect
import os
import sys
from typing import List

from flexbe_core import EventState

from . import StateDefinition


def parse_state_folder(folder: str, import_path_prefix: str = None) -> List[StateDefinition]:
    """Parse the state folder."""
    state_defs = []
    if os.path.exists(os.path.join(folder, '__init__.py')) and import_path_prefix is None:
        import_path_prefix = os.path.dirname(folder)
    for file_name in os.listdir(folder):
        if file_name == '__init__.py':
            continue
        file_path = os.path.join(folder, file_name)
        if os.path.isdir(file_path):
            state_defs.extend(parse_state_folder(file_path, import_path_prefix))
        elif import_path_prefix is not None and os.path.splitext(file_name)[-1] == '.py':
            import_path = file_path[:-3].replace(import_path_prefix + '/', '')
            import_path = import_path.replace('/', '.')
            state_defs.extend(parse_state(import_path, file_path) or [])
    return state_defs


def parse_state(import_path: str, file_path: str) -> List[StateDefinition]:
    """Parse the state implementation file."""
    state_defs = []
    try:
        pkg = importlib.import_module(import_path)
        del sys.modules[pkg.__name__]  # prevent module caching (to allow state reloading)

        def is_state(member):
            return (inspect.isclass(member)
                    and member.__module__ == pkg.__name__
                    and issubclass(member, EventState))

        for _, cls in inspect.getmembers(pkg, is_state):
            state_class = cls.__name__
            state_doc = inspect.getdoc(cls)
            argspec = inspect.getfullargspec(cls.__init__)
            args = [arg for arg in argspec.args if arg != 'self']
            argdefs = [repr(default) for default in list(argspec.defaults or [])]
            state_params = args
            state_params_values = [''] * (len(args) - len(argdefs)) + argdefs
            state_data = {}

            # print(f'parseState {state_class} with parameters={state_params}'
            #       f' [{state_params_values}] [{argdefs}]', flush=True)

            def __event_init(*args, **kwargs):
                # print(f'state_parser: __event_init args={args} kwargs={kwargs}', flush=True)
                state_data['state_outcomes'] = kwargs.get('outcomes', [])
                state_data['state_autonomy'] = [0] * len(state_data['state_outcomes'])
                state_data['state_input'] = kwargs.get('input_keys', [])
                state_data['state_output'] = kwargs.get('output_keys', [])
                raise NotImplementedError()  # expected - used to prevent further instantiation to avoid side-effects

            EventState.__init__ = __event_init

            try:
                cls(*args)  # pass variable names for resolving symbols later
            except NotImplementedError:  # this error type is expected
                pass  # we do nothing because state_def has been updated already
            except Exception as exc:  # any other error is passed onwards
                raise Exception(
                    f"Cannot instantiate state '{cls.__name__}' to determine interface, "
                    "consider removing any code before 'super' in '__init__'. "
                    f'Error: {str(exc)}') from exc
            class_vars = [
                n for n, t in cls.__dict__.items()
                if not inspect.isfunction(t) and not n.startswith('__')
            ]
            state_defs.append(
                StateDefinition(
                    state_class=state_class,
                    state_docstring=state_doc,
                    import_path=import_path,
                    file_path=file_path,
                    state_params=state_params,
                    state_outcomes=state_data['state_outcomes'],
                    state_input=state_data['state_input'],
                    state_output=state_data['state_output'],
                    state_params_values=state_params_values,
                    state_autonomy=state_data['state_autonomy'],
                    class_vars=class_vars
                )
            )
        return state_defs
    except ImportError as exc:
        print(f'Failed to import {import_path} ({str(exc)}) ', file=sys.stderr, flush=True)
    except Exception as exc:
        print(f'Failed to process {import_path} ({str(exc)}) ', file=sys.stderr, flush=True)
    return None
