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

"""WebServer for flexbe_webui."""

import argparse
import json
import os
from datetime import datetime
from subprocess import Popen
from typing import Dict, List, Optional

from ament_index_python import get_package_share_directory

from fastapi import Body, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

import uvicorn

from .io.base_models import Behavior
from .io.behavior_parser import parse_behavior_folder
from .io.code_generator import CodeGenerator
from .io.manifest_generator import ManifestGenerator, generate_file_name, generate_manifest_name
from .io.state_parser import parse_state_folder
from .ros import PackageData
from .ros.packages import get_packages, has_behaviors, has_states
from .settings import load_settings
from .tools import find_subfolder, highlight_code, validate_path_consistency


class WebuiServer:
    """WebServer for flexbe_webui."""

    def __init__(self, args, online_mode=False):
        """Initialize WebuiServer instance."""
        self._app = FastAPI()
        self._online_mode = online_mode
        self._shutdown_allowed = True
        self._active_connections: list[WebSocket] = []
        self._running = True

        self.register(self._app)

        print(f'WebuiServer args: {args}', flush=True)
        if args.config_folder == '':
            self._config_file_folder = os.path.join(get_package_share_directory('flexbe_webui'), 'config')
        else:
            self._config_file_folder = args.config_folder

        if not os.path.exists(self._config_file_folder) or not os.path.isdir(self._config_file_folder):
            raise Exception(f"'{self._config_file_folder}' is not a valid directory!")

        if args.config_file != '':
            self._settings = load_settings({'folder_path': self._config_file_folder, 'file_name': args.config_file})
        else:
            self._settings = load_settings()

        # package cache
        self._packages: Optional[Dict[str, PackageData]] = None
        if self._settings['pkg_cache_enabled'] and not args.clear_cache:
            file_path = os.path.join(self._config_file_folder, 'flexbe_packages.cache')
            try:
                with open(file_path, 'rt', encoding=self._settings['text_encoding']) as fin:
                    package_data = json.load(fin)
                self._packages = {name: PackageData.from_dict(data) for name, data in package_data.items()}
                print(f"\x1b[92mLoaded data for {len(self._packages)} existing packages from cache at '{file_path}!\x1b[0m")
            except Exception as exc:
                print(f"\x1b[95m Failed to load package data from cache at '{file_path}'\x1b[0m", flush=True)
                print(exc)
                self._packages: Optional[Dict[str, PackageData]] = None
        else:
            print('\x1b[94mPlan to parse all ROS packages looking for states and behaviors.\x1b[0m', flush=True)

    @property
    def packages(self) -> Dict[str, PackageData]:
        """Return all FlexBE packages."""
        if self._packages is None:
            self._packages = get_packages()
            if self._settings['pkg_cache_enabled']:
                self.save_package_cache()
        return self._packages

    def save_package_cache(self):
        """Save package cache to configuration folder."""
        file_path = os.path.join(self._config_file_folder, 'flexbe_packages.cache')
        try:
            with open(file_path, 'wt', encoding=self._settings['text_encoding']) as fout:
                json.dump({name: pkg.model_dump() for name, pkg in self.packages.items()}, fout, indent=4)
            print(f"\x1b[93mSaved data for {len(self.packages)} packages to cache in '{file_path}' ...\x1b[0m", flush=True)

        except Exception as exc:
            print(f"\x1b[91mFailed to save package data to configuration file '{file_path}'\x1b[0m", flush=True)
            print(exc)

    def register(self, app: FastAPI):
        """Register the webserver resources."""
        print('Set up FastAPI/websocket connections ...')
        resource_path = os.path.join(os.path.dirname(__file__), 'app')
        if not os.path.isdir(resource_path):
            resource_path = os.path.join(get_package_share_directory('flexbe_webui'), 'app')
        print(f"Using flexbe_webui resource path='{resource_path}'!", flush=True)
        app.mount('/app', StaticFiles(directory=resource_path), name='app')
        app.mount('/img', StaticFiles(directory=os.path.join(resource_path, 'img')), name='img')
        templates = Jinja2Templates(directory=resource_path)

        @app.on_event('startup')
        async def on_startup():
            print('FlexBE WebUI Server started!', flush=True)

        @app.on_event('shutdown')
        async def on_shutdown():
            print('FlexBE WebUI Server is shutting down!', flush=True)

        @app.get('/api/v1/ready')
        async def read_ready():
            print('\x1b[92mFlexBE WebUI Server is ready!\x1b[0m', flush=True)
            self._shutdown_allowed = False  # UI is now connected, require confirmation
            return {'status': 'ok', 'online_mode': self._online_mode}

        @app.post('/api/v1/confirm_shutdown')
        async def confirm_shutdown(allow_shutdown: bool = Body(False)):
            try:
                print(f'Received shutdown confirmation from UI {allow_shutdown}', flush=True)
                self._shutdown_allowed = allow_shutdown
                if self._shutdown_allowed:
                    msg = 'Shutdown is allowed.'
                else:
                    msg = 'Shutdown rejected!'

                # PySide6 won't let us return value from JavaScript, so send command to websocket
                print(f"Broadcast shutdown message '{msg}' to {len(self._active_connections)} UIs ...", flush=True)
                for websock in self._active_connections:
                    print('Sending shutdown command to UI...', flush=True)
                    await websock.send_text(msg)

                return {'confirm': self._shutdown_allowed}
            except Exception as exc:
                print(f'\x1b[91mFailed to load configuration:\n{exc}\x1b[0m', flush=True)
                return {'success': False, 'text': str(exc)}

        @app.websocket('/ws/check_shutdown')
        async def websocket_endpoint(websocket: WebSocket):
            print('defining websocket endpoint for checking shutdown', flush=True)

            await websocket.accept()
            print('accepted websocket for checking shutdown', flush=True)
            self._active_connections.append(websocket)

            try:
                while self._running:
                    data = await websocket.receive_text()
                    print(f"Received data from websocket for 'check_shutdown' - {data}")
                    if data == 'check_shutdown':
                        if self._shutdown_allowed:
                            await websocket.send_text('Shutdown is allowed.')
                        else:
                            await websocket.send_text('Prevent shutdown!')
            except WebSocketDisconnect as exc:
                print(f"flexbe_webui_server: 'check_shutdown' - WebSocket disconnected!\n    {exc}", flush=True)
            except RuntimeError as exc:
                print(f"flexbe_webui_server: 'check_shutdown' - {exc}", flush=True)

            print('Finished with websocket for checking shutdown!', flush=True)
            self._active_connections.remove(websocket)

        @app.get('/', response_class=HTMLResponse)
        async def index(request: Request):
            print(f'loading window.html {request}', flush=True)
            return templates.TemplateResponse('window.html', {'request': request})

        @app.get('/api/v1/get_config_files')
        async def get_config_files():
            try:
                print(f"get available configuration files from '{self._config_file_folder}'", flush=True)
                files = [f for f in os.listdir(self._config_file_folder) if f.endswith('.json')]
                files.sort()
                return {'success': True, 'folder_path': self._config_file_folder, 'config_files': files}
            except Exception as exc:
                return {'success': False, 'text': str(exc)}

        @app.post('/api/v1/get_config_settings')
        async def get_config_settings(json_file_dict: Dict = Body(None)):
            try:
                if self._settings is None:
                    self._settings = load_settings(json_file_dict)
                elif (json_file_dict is not None and 'file_name' in json_file_dict):
                    print(f' get_config_settings {json_file_dict}')
                    self._settings = load_settings(json_file_dict)
                else:
                    print('Return existing settings', flush=True)
                return {'success': True, 'configuration': self._settings}
            except Exception as exc:
                print(f'\x1b[91mFailed to load configuration:\n{exc}\x1b[0m', flush=True)
                return {'success': False, 'text': str(exc)}

        @app.post('/api/v1/save_config_settings')
        async def save_config_settings(json_dict: Dict = Body(None)):
            print('Update the configuration settings on server side', flush=True)
            try:
                save_cache = self._settings['pkg_cache_enabled']
                self._settings.update(json_dict['configuration'])
                if 'file_name' in json_dict:
                    try:
                        print('Save current settings to the configuration file ...', flush=True)
                        print(self._settings, flush=True)
                        file_path = os.path.join(json_dict['folder_path'], json_dict['file_name'])
                        with open(file_path, 'w', encoding=self._settings['text_encoding']) as json_file:
                            json.dump(self._settings, json_file, indent=4)
                        print(f"Dictionary saved to '{file_path}'", flush=True)
                    except Exception as exc:
                        print('Failed to save configuration settings to file', flush=True)
                        return {'success': False, 'text': str(exc)}
                if self._settings['pkg_cache_enabled'] and not save_cache:
                    # We have recently enabled package cache, so save what we currently have
                    self.save_package_cache()

                print('Updated configuration settings', flush=True)
                return {'success': True}
            except Exception as exc:
                print('Failed to update the configuration settings', flush=True)
                return {'success': False, 'text': str(exc)}

        @app.get('/api/v1/packages/behaviors')
        async def packages_behaviors():
            """Return list of packages that may define behaviors."""
            list_of_behaviors = list(filter(has_behaviors, self.packages.values()))
            print(30 * '=', flush=True)
            print('packages_behaviors: list of behaviors ...')
            for beh in list_of_behaviors:
                print(f'    {beh}', flush=True)
            print(30 * '=', flush=True)

            return list_of_behaviors

        @app.get('/api/v1/io/behaviors/{package_name}')
        async def io_behaviors(package_name: str):
            """Return list of manifest data for all behaviors in given package."""
            # print(f' ready to process io_behaviors using {package_name} for behaviors ...', flush=True)
            try:
                package = self.packages.get(package_name)
                if package is None:
                    raise HTTPException(status_code=404, detail=f'Package {package_name} not found!')

                # print(f'   ready to parse_behavior_folder({package.path}, '
                #       f'{package.python_path}, {package.editable}) ...', flush=True)
                return parse_behavior_folder(package.path, package.python_path, package.editable, self._settings['text_encoding'])
            except HTTPException as exc:
                print(f" Exception handling behaviors for '{package_name}' --- {exc}", flush=True)
                raise Exception(f'Error in {package_name}:\n{exc}') from exc
            except Exception as exc:
                print(f" Exception handling behaviors for '{package_name}' --- {exc}", flush=True)
                raise Exception(f'Error in {package_name}:\n{exc}') from exc

        @app.get('/api/v1/packages/states')
        async def packages_states():
            """Return list of packages with FlexBE states."""
            return list(filter(has_states, self.packages.values()))

        @app.get('/api/v1/io/states/{package_name}')
        async def io_states(package_name: str):
            print(f' ready to process {package_name} for states ...', flush=True)
            try:
                package = self.packages.get(package_name)
                if package is None:
                    raise HTTPException(status_code=404, detail=f"Package '{package_name}' not found!")
                return parse_state_folder(package.python_path)
            except HTTPException as exc:
                print(f" Exception handling states for '{package_name}' --- {exc}", flush=True)
                raise exc
            except Exception as exc:
                print(f" Exception handling states for '{package_name}' --- {exc}", flush=True)
                raise exc

        @app.post('/api/v1/open_file_editor')
        async def open_behavior_editor(json_file_dict: Dict = Body(...)):
            try:
                print('Attempting to open file editor ...', flush=True)
                print(json_file_dict, flush=True)
                devnull = open(os.devnull, 'wb')
                editor = json_file_dict['editor']
                package_name = json_file_dict['package']
                file_name = json_file_dict['file']
                line = json_file_dict['line']

                package = self.packages.get(package_name)
                python_path = package.python_path
                file_path = os.path.join(python_path, file_name)
                if '.py' not in file_path:
                    print(f"Adding .py to file name '{file_name}'", flush=True)
                    file_path += '.py'

                print(f'  {file_path} ...', flush=True)
                editor = editor.replace('$FILE', file_path)
                if line is None or line == '' or line == '0':
                    editor = editor.replace('+$LINE', '')  # this presumes gedit style!
                else:
                    editor = editor.replace('$LINE', line)

                command = ['nohup'] + editor.strip().split(' ')
                print(f'Popen({command})', flush=True)
                Popen(command, stdout=devnull, stderr=devnull)
                return True
            except Exception as exc:
                print('Failed to open file editor', flush=True)
                raise exc

        @app.post('/api/v1/view_file_source')
        async def view_file_source(json_file_dict: Dict = Body(...)):
            try:
                print('Attempting to open file viewer ...', flush=True)
                print(json_file_dict, flush=True)
                package_name = json_file_dict['package']
                file_name = json_file_dict['file']

                package = self.packages.get(package_name)
                python_path = package.python_path
                file_path = os.path.join(python_path, file_name)
                if '.py' not in file_path:
                    print(f"Adding .py to file name '{file_name}'", flush=True)
                    file_path += '.py'

                print(f'  {file_path} ...', flush=True)
                try:
                    with open(file_path, 'r') as file:
                        code = file.read()

                    highlighted_code = highlight_code(code, self._settings['visualize_whitespace'])

                    return {'result': True, 'text': highlighted_code, 'file_path': file_path}
                except Exception as exc:
                    print(f"Failed to format code for '{file_path}':\n{type(exc)} - {exc}")
                    return {'result': False, 'text': str(exc)}

            except Exception as exc:
                print('Failed to open file editor', flush=True)
                return {'result': False, 'text': str(exc)}

        @app.post('/api/v1/behavior/code_generator')
        async def behavior_code_generator(json_dict: Dict = Body(...)):
            result_dict = {'install_success': False, 'error_msg': '',
                           'src_save_success': False, 'src_error_msg': ''}

            try:
                # Extract data from JSON dictionary body
                ws = json_dict['ws']
                package_name = json_dict['package_name']
                file_name = json_dict['file_name']
                explicit_package = json_dict['explicit_package']
                contained_behavior_names = json_dict['behavior_names']
                print(' behavior_code_generator for '
                      f"'{ws}'/{package_name}/'{file_name}' ...", flush=True)

                # Allow access using attributes
                try:
                    behavior = Behavior(**(json_dict['behavior']))
                except Exception as exc:
                    print(' Error processing behavior in behavior_code_generator '
                          f"for '{ws}'/{package_name}/'{file_name}' ...", flush=True)
                    print(exc, flush=True)
                    print('Failed!')
                    print('---------------------')
                    print(json.dumps(json_dict['behavior'], indent=4), flush=True)
                    print('---------------------')
                    print(f'Failed to extract behavior: {exc}', flush=True)
                    result_dict.update({'error_msg': 'Failed to extract behavior', 'exception': str(exc)})
                    return result_dict

                if package_name != behavior.behavior_package:
                    print(f"package name difference! '{package_name}' '{behavior.package_name}'", flush=True)

                package = self.packages.get(package_name)
                print(f'package: {package}', flush=True)

                python_path = package.python_path
                behavior_file_name = ''
                if behavior.file_name is None:
                    behavior_file_name = generate_file_name(behavior.behavior_name)
                else:
                    behavior_file_name = behavior.file_name

                if file_name != behavior_file_name:
                    print(f"behavior name difference! '{file_name}' '{behavior_file_name}'", flush=True)
                    file_name = behavior_file_name

                if '.py' not in file_name:
                    print(f"Adding .py to file name '{file_name}'", flush=True)
                    file_name += '.py'  # remaining code presumes .py extension

                print(f" Generate code to '{file_name}' at '{package.path}' using ws='{ws}' "
                      f'and explicit package={explicit_package} ...', flush=True)

                cg = CodeGenerator(ws=ws,
                                   target_line_length=self._settings['target_line_length'],
                                   initialize_flexbe_core=self._settings['initialize_flexbe_core'])
                cg.set_explicit_package(explicit_package)

                code = cg.generate_behavior_code(behavior)
                # Validate the code
                try:
                    compile(code, '<string>', 'exec')
                    print(' Python code compiles!', flush=True)
                except SyntaxError as exc:
                    print('Python code does NOT compile!')
                    print(exc, flush=True)
                    print(30 * '=')
                    print('\n'.join([f'{i:4d} {line}' for i, line in
                                     enumerate(code.split('\n'))]))
                    print(30 * '-')
                    print(exc, flush=True)
                    print(30 * '=')

                    result_dict.update({'error_msg': 'Python code does NOT compile!'})
                    return result_dict

                manifest_path = ''
                if behavior.manifest_path is None:
                    folder_path = os.path.join(package.path, 'lib', behavior.behavior_package, 'manifest')
                    manifest_name = generate_manifest_name(behavior.behavior_name)
                    manifest_path = os.path.join(folder_path, manifest_name)
                    print(f"Built manifest path='{manifest_path}' from '{folder_path}' and '{manifest_name}'"
                          f" given behavior='{behavior.behavior_name}'", flush=True)
                else:
                    manifest_path = behavior.manifest_path
                    manifest_name = os.path.basename(manifest_path)

                # Validate that python_path and manifest paths are consistent
                if not validate_path_consistency(python_path, manifest_path):
                    error_msg = (f'Inconsistent paths!\n'
                                 f"         for manifest='{manifest_path}'\n"
                                 f"                 code='{python_path}' ")
                    result_dict.update({'error_msg': error_msg})
                    print(f'\x1b[91m{error_msg}\x1b[0m', flush=True)
                    return result_dict

                encoding = self._settings['text_encoding'].upper()
                mg = ManifestGenerator(ws)
                manifest_content = ''
                manifest_content += f'<?xml version="1.0" encoding="{encoding}"?>\n'
                manifest_content += '\n'
                manifest_content += '<behavior name=\"' + behavior.behavior_name + '\">\n'
                manifest_content += '\n'

                manifest_content += mg.generate_manifest_header(behavior.behavior_package,
                                                                file_name,
                                                                behavior.behavior_name,
                                                                behavior.tags,
                                                                behavior.author,
                                                                behavior.creation_date,
                                                                behavior.behavior_description)
                manifest_content += '\n'
                manifest_content += mg.generate_manifest_contains(contained_behavior_names)
                manifest_content += '\n'
                manifest_content += mg.generate_manifest_parameters(behavior.behavior_parameters)
                manifest_content += '\n'
                manifest_content += '</behavior>\n'

                with open(manifest_path, 'w', encoding=self._settings['text_encoding']) as fout:
                    print(f" Saving manifest file to '{manifest_path}' ...", flush=True)
                    fout.write(manifest_content)

                python_file_path = os.path.join(python_path, file_name)
                with open(python_file_path, 'w', encoding=self._settings['text_encoding']) as fout:
                    print(f" Saving behavior code to '{python_file_path}' ...", flush=True)
                    fout.write(code)

                result_dict.update({'install_success': True,
                                    'python_file_path': python_path,
                                    'python_file_name': file_name.replace('.py', ''),
                                    'manifest_file_path': manifest_path})
                if self._settings['save_in_source']:
                    source_code_root = self._settings['source_code_root']
                    if os.path.exists(source_code_root) and os.path.isdir(source_code_root):
                        print(f"Attempt to save behavior into the development source folder '{source_code_root}'")
                        package_folder = find_subfolder(source_code_root, package_name)
                        if package_folder is None:
                            msg = f"Failed to find source code package '{package_name}' under '{source_code_root}'"
                            print(f'\x1b[91m{msg}\x1b[0m', flush=True)
                            result_dict.update({'src_save_success': False, 'src_error_msg': msg})
                            return result_dict
                    else:
                        result_dict.update({'src_save_success': False,
                                            'src_error_msg': f'Cannot save in source code folder - '
                                                             f"'{source_code_root}' does not exist"})
                        return result_dict

                    manifest_path = os.path.join(package_folder, 'manifest')
                    msg = 'Cannot save behavior to source code folder.  '
                    valid = True
                    if not (os.path.exists(manifest_path) and os.path.isdir(manifest_path)):
                        msg += f"'{manifest_path}' does not exist"
                        valid = False

                    python_path = os.path.join(package_folder, package_name)
                    if not (os.path.exists(python_path) and os.path.isdir(python_path)):
                        msg += f"'{python_path}' does not exist"
                        valid = False

                    if not valid:
                        print(f'\x1b[91m{msg}\x1b[0m', flush=True)
                        result_dict.update({'src_save_success': False,
                                            'src_error_msg': msg})
                        return result_dict
                    try:
                        manifest_path = os.path.join(manifest_path, manifest_name)
                        with open(manifest_path, 'w', encoding=self._settings['text_encoding']) as fout:
                            print(f" Saving manifest file to '{manifest_path}' ...", flush=True)
                            fout.write(manifest_content)

                        python_file_path = os.path.join(python_path, file_name)
                        with open(python_file_path, 'w', encoding=self._settings['text_encoding']) as fout:
                            print(f" Saving behavior code to '{python_file_path}' ...", flush=True)
                            fout.write(code)
                    except Exception as exc:
                        result_dict.update({'src_save_success': False,
                                            'src_error_msg': f"Failed to save in source code folder - '{exc}'"})
                        return result_dict

                    print(f"\x1b[92mSuccessfully saved behavior to '{package_folder}'!\x1b[0m")
                print(' done!', flush=True)
                result_dict.update({'src_save_success': True})
                return result_dict
            except Exception as exc:
                print(f" Exception generating code for '{file_name}' in '{package_name}'  -- {exc}", flush=True)
                import traceback
                print(traceback.format_exc().replace('%', '%%'), flush=True)
                print(30 * '-')
                print(json_dict['behavior'], flush=True)
                result_dict.update({'error_msg': str(exc)})
                print(30 * '-', flush=True)
                return result_dict

        @app.post('/api/v1/behavior/manifest_generator')
        async def behavior_manifest_generator(json_manifest_dict: Dict = Body(...)):
            try:
                behavior = Behavior(**json_manifest_dict['behavior'])
                contained_behavior_names = json_manifest_dict['behavior_names']
                print(' Manifest_generator:  behavior_manifest_generator for '
                      f"'{behavior.behavior_package}/{behavior.behavior_name}' ...", flush=True)
            except Exception as exc:
                print(' Manifest_generator: Exception generating manifest '
                      f'for:\n {json_manifest_dict} -- {exc}', flush=True)
                import traceback
                print(traceback.format_exc().replace('%', '%%'))
                return False

            try:
                manifest_content = ''
                try:
                    ws = json_manifest_dict['ws']
                except Exception:
                    print('Using default 4 spaces to generate the manifest!')
                    ws = '    '

                mg = ManifestGenerator(ws)

                package = self.packages.get(behavior.behavior_package)
                package_path = package.path

                file_name = ''
                if behavior.file_name is None:
                    file_name = generate_file_name(behavior.behavior_name)
                else:
                    file_name = behavior.file_name

                manifest_path = ''
                if behavior.manifest_path is None:
                    folder_path = os.path.join(package_path, 'lib', behavior.behavior_package, 'manifest')
                    manifest_name = generate_manifest_name(behavior.behavior_name)
                    manifest_path = os.path.join(folder_path, manifest_name)
                else:
                    manifest_path = behavior.manifest_path

                encoding = self._settings['text_encoding'].upper()
                manifest_content += f'<?xml version="1.0" encoding="{encoding}"?>\n'
                manifest_content += '\n'
                manifest_content += '<behavior name=\"' + behavior.behavior_name + '\">\n'
                manifest_content += '\n'

                manifest_content += mg.generate_manifest_header(behavior.behavior_package,
                                                                file_name,
                                                                behavior.behavior_name,
                                                                behavior.tags,
                                                                behavior.author,
                                                                behavior.creation_date,
                                                                behavior.behavior_description)
                manifest_content += '\n'
                manifest_content += mg.generate_manifest_contains(contained_behavior_names)
                manifest_content += '\n'
                manifest_content += mg.generate_manifest_parameters(behavior.behavior_parameters)
                manifest_content += '\n'
                manifest_content += '</behavior>'

                with open(manifest_path, 'w', encoding=self._settings['text_encoding']) as fout:
                    print(f"Saving manifest to '{manifest_path}' ...", end='', flush=True)
                    fout.write(manifest_content)
                    print(' done!', flush=True)

                return True
            except Exception as exc:
                print(f'Exception generating manifest for:\n {behavior.name} -- {exc}', flush=True)
                import traceback
                print(traceback.format_exc().replace('%', '%%'))
                return False

    def run(self, port: int = 8000, logging: str = 'warning'):
        """Run main web server loop."""
        print(f'  Configure uvicorn port={port} logging={logging} ...', flush=True)
        config = uvicorn.Config(self._app, port=port, log_level=logging)
        print('  Construct uvicorn server ...', flush=True)
        server = uvicorn.Server(config)
        print('  Run uvicorn server...', flush=True)
        server.run()
        print('  Done running uvicorn server.', flush=True)
        self._running = False


def parse_args(args: List[str] = None):
    """Parse command line arguments for webui_server and webui_node."""
    parser = argparse.ArgumentParser(description='FlexBE WebUI Server parameters')
    parser.add_argument('--port', type=str, default='8000', help="FlexBE WebUI Server port (default='8000')")
    parser.add_argument('--config_folder', type=str, default='',
                        help="FlexBE WebUI Server configuration file folder (default='' use 'flexbe_webui/config')")
    parser.add_argument('--config_file', type=str, default='',
                        help="FlexBE WebUI Server configuration file (default='' use default settings)")
    parser.add_argument('--clear_cache', type=bool, default=False, help='Clear existing package data cache and reprocess')

    VALID_LOGGING_LEVELS = ['critical', 'error', 'warning', 'info', 'debug', 'trace']

    def validate_logging_level(level: str) -> str:
        if level.lower() not in VALID_LOGGING_LEVELS:
            raise argparse.ArgumentTypeError(f"Invalid logging level: {level}. Choose from {', '.join(VALID_LOGGING_LEVELS)}")
        return level.lower()

    parser.add_argument('--logging_level', type=validate_logging_level, default='warning',
                        help=f"Set uvicorn logging level ({', '.join(VALID_LOGGING_LEVELS)})")

    return parser.parse_known_args()


def main(args: List[str] = None):
    """Run WebUI server in offline stand alone mode."""
    print('\nStarting FlexBE WebUI server ', end='', flush=True)
    args, _ = parse_args(args)
    print(f'  args: {args}', flush=True)

    try:
        port = int(args.port)
    except Exception as exc:
        print(f'\n  Invalid port = {args.port} - {exc}', flush=True)
        return

    print(f'at port={port} logging={args.logging_level} ...', flush=True)
    webui_server = WebuiServer(args)
    webui_server.run(port, args.logging_level)
    print('shutdown FlexBE WebUI server!', flush=True)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print(f'Keyboard interrupt request  at {datetime.now()} - ! Shut the flexbe webui server down!', flush=True)
    except Exception as exc:
        print(f'Exception in executor       at {datetime.now()} - ! {type(exc)}\n  {exc}', flush=True)
        import traceback
        print(f"{traceback.format_exc().replace('%', '%%')}", flush=True)
