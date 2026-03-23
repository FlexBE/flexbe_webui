# Copyright 2026 Philipp Schillinger and Christopher Newport University
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
import glob
import hmac
import importlib
import json
import logging
import os
import shlex
import shutil
import threading
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime
from subprocess import Popen
from typing import Dict, List, Optional

from ament_index_python import get_package_share_directory

from fastapi import Body, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

import uvicorn

from .io.base_models import Behavior, BehaviorCodeGeneratorRequest, FileRequest, OpenFileEditorRequest
from .io.behavior_parser import parse_behavior_folder
from .io.code_generator import CodeGenerator
from .io.manifest_generator import ManifestGenerator
from .io.manifest_generator import generate_file_name, generate_manifest_name
from .io.state_parser import parse_state_folder
from .ros import PackageData
from .ros.packages import get_packages, has_behaviors, has_states
from .settings import load_settings, update_settings
from .tools import find_subfolder, highlight_code, validate_path_consistency

LOGGER = logging.getLogger(__name__)


class WebuiServer:
    """WebServer for flexbe_webui."""

    def __init__(self, args, online_mode=False):
        """Initialize WebuiServer instance."""
        self._app = FastAPI(lifespan=self._lifespan)
        self._online_mode = online_mode
        self._shutdown_allowed = True
        self._active_connections: list[WebSocket] = []
        self._running = True
        self._api_token = os.getenv('FLEXBE_WEBUI_API_TOKEN', '').strip()
        self._diag_lock = threading.Lock()
        self._diag_capacity = 200
        self._diag_timings = deque(maxlen=self._diag_capacity)
        self._diag_counts = {}
        if self._api_token:
            print('\x1b[93mAPI token auth enabled for mutating endpoints.\x1b[0m', flush=True)

        self.register(self._app)

        print(f'WebuiServer args: {args}', flush=True)
        if args.config_folder == '':
            self._config_file_folder = os.path.join(get_package_share_directory('flexbe_webui'), 'config')
        else:
            self._config_file_folder = args.config_folder

        if not os.path.exists(self._config_file_folder) or not os.path.isdir(self._config_file_folder):
            raise ValueError(f"'{self._config_file_folder}' is not a valid directory!")

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
            except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
                print(f"\x1b[95m Failed to load package data from cache at '{file_path}'\x1b[0m", flush=True)
                print(exc)
                self._packages: Optional[Dict[str, PackageData]] = None
        else:
            print('\x1b[94mPlan to parse all ROS packages looking for states and behaviors.\x1b[0m', flush=True)

    @asynccontextmanager
    async def _lifespan(self, _app: FastAPI):
        """Manage FastAPI startup and shutdown lifecycle events."""
        print('FlexBE WebUI Server started!', flush=True)
        try:
            yield
        finally:
            print('FlexBE WebUI Server is shutting down!', flush=True)

    def _log_request(self, level: int, endpoint: str, duration_seconds: float, **context):
        """Emit a structured log entry for API request handling."""
        if not self._settings.get('structured_request_logging', True):
            return
        if not LOGGER.isEnabledFor(level):
            return

        payload = {
            'endpoint': endpoint,
            'duration_ms': round(duration_seconds * 1000.0, 2),
        }
        for key, value in context.items():
            if value is not None:
                payload[key] = value
        LOGGER.log(level, json.dumps(payload, sort_keys=True))

    def _record_timing(self, category: str, endpoint: str, duration_seconds: float, success: bool, **context):
        """Record recent timing entries for diagnostics output."""
        entry = {
            'ts': datetime.now().isoformat(timespec='seconds'),
            'category': category,
            'endpoint': endpoint,
            'duration_ms': round(duration_seconds * 1000.0, 2),
            'success': bool(success),
        }
        for key, value in context.items():
            if value is not None:
                entry[key] = value

        key = f'{category}:{endpoint}:{"ok" if success else "fail"}'
        with self._diag_lock:
            self._diag_timings.append(entry)
            self._diag_counts[key] = self._diag_counts.get(key, 0) + 1

    def get_diagnostics_snapshot(self):
        """Return in-memory diagnostics summary and recent timings."""
        with self._diag_lock:
            timings = list(self._diag_timings)
            counts = dict(self._diag_counts)

        category_stats = {}
        for entry in timings:
            category = entry.get('category', 'unknown')
            bucket = category_stats.setdefault(category, {'count': 0, 'avg_ms': 0.0, 'max_ms': 0.0})
            bucket['count'] += 1
            duration = float(entry.get('duration_ms', 0.0))
            bucket['avg_ms'] += duration
            bucket['max_ms'] = max(bucket['max_ms'], duration)
        for bucket in category_stats.values():
            if bucket['count'] > 0:
                bucket['avg_ms'] = round(bucket['avg_ms'] / bucket['count'], 2)

        return {
            'generated_at': datetime.now().isoformat(timespec='seconds'),
            'counts': counts,
            'categories': category_stats,
            'recent_timings': timings[-50:],
        }

    @staticmethod
    def api_success(data=None, status_code: int = 200):
        """Return a normalized API success envelope."""
        return JSONResponse(
            status_code=status_code,
            content={
                'success': True,
                'data': jsonable_encoder(data),
                'error': None,
                'status': status_code,
            },
        )

    @staticmethod
    def api_failure(error, data=None, status_code: int = 200):
        """Return a normalized API failure envelope."""
        return JSONResponse(
            status_code=status_code,
            content={
                'success': False,
                'data': jsonable_encoder(data),
                'error': str(error),
                'status': status_code,
            },
        )

    @staticmethod
    def api_command_success(key: str = 'ok', status_code: int = 200):
        """Return a normalized success envelope for command-style mutations."""
        return WebuiServer.api_success({key: True}, status_code=status_code)

    @staticmethod
    def api_command_failure(error, key: str = 'ok', status_code: int = 200):
        """Return a normalized failure envelope for command-style mutations."""
        return WebuiServer.api_failure(error, data={key: False}, status_code=status_code)

    @staticmethod
    def _is_within_root(root: str, path: str) -> bool:
        """
        Return true if path is within root by lexical or resolved containment.

        The lexical check allows valid ``--symlink-install`` layouts where a file
        appears under an install prefix but resolves to a source-tree target.
        """
        try:
            root_abs = os.path.abspath(root)
            path_abs = os.path.abspath(path)
            if os.path.commonpath([root_abs, path_abs]) == root_abs:
                return True

            root_real = os.path.realpath(root)
            path_real = os.path.realpath(path)
            return os.path.commonpath([root_real, path_real]) == root_real
        except ValueError:
            return False

    def _get_package_python_roots(self, package_name: str, package: PackageData) -> List[str]:
        """Collect candidate Python roots for ROS package source resolution."""
        roots: List[str] = []
        if package.python_path is not None:
            roots.append(os.path.abspath(package.python_path))

        try:
            module = importlib.import_module(package_name)
            for module_path in getattr(module, '__path__', []):
                roots.append(os.path.abspath(module_path))
        except (ImportError, AttributeError, ValueError, TypeError):
            pass

        unique_roots: List[str] = []
        for root in roots:
            if root not in unique_roots and os.path.isdir(root):
                unique_roots.append(root)
        return unique_roots

    def _candidate_roots_from_manifest(self, manifest_path: Optional[str], package_name: str) -> List[str]:
        """Infer candidate Python roots from a behavior manifest install path."""
        if not manifest_path:
            return []
        manifest_real = os.path.realpath(str(manifest_path))
        marker = f'{os.sep}lib{os.sep}'
        if marker not in manifest_real:
            return []
        install_prefix = manifest_real.split(marker, 1)[0]
        candidates = []
        pattern = os.path.join(install_prefix, 'lib', 'python*', 'site-packages', package_name)
        candidates.extend(glob.glob(pattern))
        candidates.append(os.path.join(install_prefix, 'lib', package_name))
        roots = []
        for root in candidates:
            root_abs = os.path.abspath(root)
            if root_abs not in roots and os.path.isdir(root_abs):
                roots.append(root_abs)
        return roots

    def _resolve_package_python_file(self, package_name: str, package: PackageData, file_name: str,
                                     manifest_path: Optional[str] = None) -> str:
        """Resolve behavior/state file path within ROS package Python roots."""
        requested = str(file_name).strip()
        if requested == '':
            raise ValueError('No file name provided')
        if '.py' not in requested:
            requested += '.py'

        roots = self._get_package_python_roots(package_name, package)
        for root in self._candidate_roots_from_manifest(manifest_path, package_name):
            if root not in roots:
                roots.append(root)
        if len(roots) == 0:
            raise ValueError(f"Invalid package '{package_name}' for source lookup")

        if os.path.isabs(requested):
            file_path = os.path.abspath(requested)
            if any(self._is_within_root(root, file_path) for root in roots):
                return file_path
            raise ValueError(f"Path '{file_name}' is outside package Python path")

        direct_candidates: List[str] = []
        for root in roots:
            candidate = os.path.abspath(os.path.join(root, requested))
            if self._is_within_root(root, candidate):
                direct_candidates.append(candidate)
                if os.path.exists(candidate):
                    return candidate

        # If only a bare file name was provided, search recursively under allowed roots.
        if os.path.basename(requested) == requested:
            matches: List[str] = []
            for root in roots:
                for dirpath, _, files in os.walk(root):
                    if requested in files:
                        match = os.path.abspath(os.path.join(dirpath, requested))
                        if self._is_within_root(root, match):
                            matches.append(match)
            if len(matches) == 0 and os.path.isdir(package.path):
                package_root = os.path.abspath(package.path)
                for dirpath, _, files in os.walk(package_root):
                    if requested in files:
                        match = os.path.abspath(os.path.join(dirpath, requested))
                        if self._is_within_root(package_root, match):
                            matches.append(match)
            if len(matches) == 1:
                return matches[0]
            if len(matches) > 1:
                raise ValueError(f"Ambiguous file '{file_name}' in package '{package_name}'")

        if len(direct_candidates) > 0:
            # Keep previous behavior for editor/viewer: let open/read handle non-existent file.
            return direct_candidates[0]

        raise ValueError(f"Path '{file_name}' is outside package Python path")

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

        except (OSError, TypeError, ValueError) as exc:
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

        @app.exception_handler(Exception)
        async def unhandled_exception_handler(request: Request, exc: Exception):
            """Handle truly unexpected server errors at API boundary."""
            print(f'\x1b[91mUnhandled exception for {request.url.path}: {type(exc)} - {exc}\x1b[0m', flush=True)
            import traceback
            tb = ''.join(traceback.format_exception(type(exc), exc, exc.__traceback__))
            print(tb.replace('%', '%%'), flush=True)
            if request.url.path.startswith('/api/'):
                return self.api_failure('Unexpected server error', status_code=500)
            return JSONResponse(status_code=500, content={'detail': 'Internal Server Error'})

        @app.exception_handler(HTTPException)
        async def api_http_exception_handler(request: Request, exc: HTTPException):
            """Normalize FastAPI HTTP errors for API callers."""
            if request.url.path.startswith('/api/'):
                return self.api_failure(exc.detail, status_code=exc.status_code)
            return JSONResponse(status_code=exc.status_code, content={'detail': exc.detail})

        @app.get('/api/v1/dev/diagnostics')
        async def diagnostics():
            """Return server timing diagnostics for development troubleshooting."""
            return self.api_success(self.get_diagnostics_snapshot())

        @app.get('/dev/diagnostics', response_class=HTMLResponse)
        async def diagnostics_page():
            """Serve lightweight diagnostics page with auto-refresh."""
            return """<!doctype html>
<html>
<head>
  <meta charset='utf-8'/>
  <title>FlexBE WebUI Diagnostics</title>
  <style>
    body { font-family: monospace; margin: 16px; }
    h1 { margin: 0 0 12px 0; }
    pre { background: #f4f4f4; padding: 12px; border-radius: 6px; overflow: auto; }
  </style>
</head>
<body>
  <h1>FlexBE WebUI Diagnostics</h1>
  <p>Refreshing every 2s from <code>/api/v1/dev/diagnostics</code>.</p>
  <pre id='out'>Loading...</pre>
  <script>
    async function refresh() {
      try {
        const res = await fetch('/api/v1/dev/diagnostics');
        const payload = await res.json();
        document.getElementById('out').textContent = JSON.stringify(payload.data ?? payload, null, 2);
      } catch (err) {
        document.getElementById('out').textContent = 'Diagnostics fetch failed: ' + err;
      }
    }
    refresh();
    setInterval(refresh, 2000);
  </script>
</body>
</html>"""

        @app.get('/api/v1/ready')
        async def read_ready():
            print('\x1b[92mFlexBE WebUI Server is ready!\x1b[0m', flush=True)
            self._shutdown_allowed = False  # UI is now connected, require confirmation
            return self.api_success({'status': 'ok', 'online_mode': self._online_mode})

        @app.post('/api/v1/confirm_shutdown')
        async def confirm_shutdown(request: Request, allow_shutdown: bool = Body(False)):
            try:
                self.authorize_request(request)
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

                return self.api_success({'confirm': self._shutdown_allowed})
            except (RuntimeError, WebSocketDisconnect, ValueError) as exc:
                print(f'\x1b[91mFailed to load configuration:\n{exc}\x1b[0m', flush=True)
                return self.api_failure(exc)

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
            if websocket in self._active_connections:
                self._active_connections.remove(websocket)

        @app.get('/', response_class=HTMLResponse)
        async def index(request: Request):
            print(f'loading window.html {request}', flush=True)
            return templates.TemplateResponse(request, 'window.html')

        @app.get('/api/v1/get_config_files')
        async def get_config_files():
            try:
                print(f"get available configuration files from '{self._config_file_folder}'", flush=True)
                files = [f for f in os.listdir(self._config_file_folder) if f.endswith('.json')]
                files.sort()
                return self.api_success({'folder_path': self._config_file_folder, 'config_files': files})
            except OSError as exc:
                return self.api_failure(exc)

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
                return self.api_success({'configuration': self._settings})
            except (OSError, TypeError, ValueError, KeyError, json.JSONDecodeError) as exc:
                print(f'\x1b[91mFailed to load configuration:\n{exc}\x1b[0m', flush=True)
                return self.api_failure(exc)

        @app.post('/api/v1/save_config_settings')
        async def save_config_settings(request: Request, json_dict: Dict = Body(None)):
            print('Update the configuration settings on server side', flush=True)
            try:
                self.authorize_request(request)
                save_cache = self._settings['pkg_cache_enabled']
                self._settings.update(json_dict['configuration'])
                self._settings = update_settings(self._settings)  # Load custom information based on settings
                if 'file_name' in json_dict:
                    try:
                        print('Save current settings to the configuration file ...', flush=True)
                        save_settings = self._settings.copy()
                        save_settings.pop('license_text')
                        print(save_settings, flush=True)
                        file_path = os.path.realpath(
                            os.path.join(json_dict['folder_path'], json_dict['file_name'])
                        )
                        allowed_root = os.path.realpath(self._config_file_folder)
                        if os.path.commonpath([allowed_root, file_path]) != allowed_root:
                            raise ValueError(f"Config save path '{file_path}' is outside the config folder")
                        if not file_path.endswith('.json'):
                            raise ValueError(f"Config save path '{file_path}' must have a .json extension")
                        with open(file_path, 'w', encoding=self._settings['text_encoding']) as json_file:
                            json.dump(save_settings, json_file, indent=4, sort_keys=True)
                        print(f"Dictionary saved to '{file_path}'", flush=True)
                    except (OSError, TypeError, ValueError, KeyError) as exc:
                        print('Failed to save configuration settings to file', flush=True)
                        return self.api_failure(exc)

                if self._settings['pkg_cache_enabled'] and not save_cache:
                    # We have recently enabled package cache, so save what we currently have
                    self.save_package_cache()

                print('Updated configuration settings', flush=True)
                return self.api_command_success()
            except (OSError, TypeError, ValueError, KeyError) as exc:
                print('Failed to update the configuration settings', flush=True)
                return self.api_command_failure(exc)

        @app.get('/api/v1/packages/behaviors')
        async def packages_behaviors():
            """Return list of packages that may define behaviors."""
            list_of_behaviors = list(filter(has_behaviors, self.packages.values()))
            print(30 * '=', flush=True)
            print('packages_behaviors: list of behaviors ...')
            for beh in list_of_behaviors:
                print(f'    {beh}', flush=True)
            print(30 * '=', flush=True)

            return self.api_success(list_of_behaviors)

        @app.get('/api/v1/io/behaviors/{package_name}')
        async def io_behaviors(package_name: str):
            """Return list of manifest data for all behaviors in given package."""
            # print(f' ready to process io_behaviors using {package_name} for behaviors ...', flush=True)
            start_clock = datetime.now().timestamp()
            endpoint = '/api/v1/io/behaviors/{package_name}'
            try:
                package = self.packages.get(package_name)
                if package is None:
                    raise HTTPException(status_code=404, detail=f'Package {package_name} not found!')

                # print(f'   ready to parse_behavior_folder({package.path}, '
                #       f'{package.python_path}, {package.editable}) ...', flush=True)
                errors = []
                result = parse_behavior_folder(
                    package.path,
                    package.python_path,
                    package.editable,
                    self._settings['text_encoding'],
                    errors=errors,
                )
                elapsed = datetime.now().timestamp() - start_clock
                self._record_timing('parse_behaviors', endpoint, elapsed, True, package=package_name)
                return self.api_success({'items': result, 'errors': errors})
            except HTTPException as exc:
                print(f" Exception handling behaviors for '{package_name}' --- {exc}", flush=True)
                elapsed = datetime.now().timestamp() - start_clock
                self._record_timing('parse_behaviors', endpoint, elapsed, False, package=package_name, error=str(exc))
                raise exc
            except (ImportError, OSError, TypeError, ValueError) as exc:
                print(f" Exception handling behaviors for '{package_name}' --- {exc}", flush=True)
                elapsed = datetime.now().timestamp() - start_clock
                self._record_timing('parse_behaviors', endpoint, elapsed, False, package=package_name, error=str(exc))
                return self.api_failure(f'Error in {package_name}: {exc}')

        @app.get('/api/v1/packages/states')
        async def packages_states():
            """Return list of packages with FlexBE states."""
            return self.api_success(list(filter(has_states, self.packages.values())))

        @app.get('/api/v1/io/states/{package_name}')
        async def io_states(package_name: str):
            print(f' ready to process {package_name} for states ...', flush=True)
            start_clock = datetime.now().timestamp()
            endpoint = '/api/v1/io/states/{package_name}'
            try:
                package = self.packages.get(package_name)
                if package is None:
                    raise HTTPException(status_code=404, detail=f"Package '{package_name}' not found!")
                errors = []
                result = parse_state_folder(package.python_path, errors=errors)
                elapsed = datetime.now().timestamp() - start_clock
                self._record_timing('parse_states', endpoint, elapsed, True, package=package_name)
                return self.api_success({'items': result, 'errors': errors})
            except HTTPException as exc:
                print(f" Exception handling states for '{package_name}' --- {exc}", flush=True)
                elapsed = datetime.now().timestamp() - start_clock
                self._record_timing('parse_states', endpoint, elapsed, False, package=package_name, error=str(exc))
                raise exc
            except (ImportError, OSError, TypeError, ValueError) as exc:
                print(f" Exception handling states for '{package_name}' --- {exc}", flush=True)
                elapsed = datetime.now().timestamp() - start_clock
                self._record_timing('parse_states', endpoint, elapsed, False, package=package_name, error=str(exc))
                return self.api_failure(exc)

        @app.post('/api/v1/open_file_editor')
        async def open_behavior_editor(request: Request, json_file_dict: OpenFileEditorRequest = Body(...)):
            start_clock = datetime.now().timestamp()
            endpoint = '/api/v1/open_file_editor'
            package_name = None
            file_name = None
            package_path = None
            try:
                self.authorize_request(request)
                package_name = json_file_dict.package
                file_name = json_file_dict.file
                line = json_file_dict.line
                manifest_path = json_file_dict.manifest_path

                package = self.packages.get(package_name)
                if package is None or package.python_path is None:
                    raise ValueError(f"Invalid package '{package_name}' for opening editor")
                package_path = package.path
                file_path = self._resolve_package_python_file(package_name, package, file_name, manifest_path)

                line = str(line) if line is not None else ''
                if line == '' or line == '0':
                    line = ''
                else:
                    if not line.isdigit():
                        raise ValueError(f"Invalid line value '{line}'")

                editor_template = self._settings.get('editor_command', 'gedit --new-window $FILE +$LINE')
                editor_parts = shlex.split(editor_template)
                if len(editor_parts) == 0:
                    raise ValueError('Invalid editor command template in configuration')

                editor_executable = os.path.basename(editor_parts[0])
                allowed_editors = set(self._settings.get('allow_editors', []))
                if editor_executable not in allowed_editors:
                    raise ValueError(f"Editor '{editor_executable}' is not allowed")

                resolved_editor = []
                for part in editor_parts:
                    updated = part.replace('$FILE', file_path)
                    if line == '':
                        updated = updated.replace('+$LINE', '')
                        updated = updated.replace(':$LINE', '')
                        updated = updated.replace('$LINE', '')
                    else:
                        updated = updated.replace('$LINE', line)
                    if updated not in ('', '+', ':'):
                        resolved_editor.append(updated)

                if len(resolved_editor) == 0:
                    raise ValueError('Resolved editor command is empty')
                if shutil.which(resolved_editor[0]) is None:
                    raise ValueError(f"Editor executable '{resolved_editor[0]}' not found in PATH")

                command = resolved_editor
                LOGGER.debug('Launch editor command: %s', command)
                with open(os.devnull, 'wb') as devnull:
                    Popen(
                        command,
                        stdout=devnull,
                        stderr=devnull,
                        stdin=devnull,
                        close_fds=True,
                        start_new_session=True,
                    )
                elapsed = datetime.now().timestamp() - start_clock
                self._log_request(
                    logging.INFO,
                    endpoint,
                    elapsed,
                    success=True,
                    package=package_name,
                    file=file_name,
                    line=line if line != '' else None,
                )
                self._record_timing('editor', endpoint, elapsed, True, package=package_name, file=file_name)
                return self.api_command_success()
            except (OSError, TypeError, ValueError, KeyError) as exc:
                elapsed = datetime.now().timestamp() - start_clock
                self._log_request(
                    logging.WARNING,
                    endpoint,
                    elapsed,
                    success=False,
                    package=package_name,
                    file=file_name,
                    package_path=package_path,
                    error_type=type(exc).__name__,
                    error=str(exc),
                )
                self._record_timing('editor', endpoint, elapsed, False, package=package_name, file=file_name, error=str(exc))
                return self.api_command_failure(exc)

        @app.post('/api/v1/view_file_source')
        async def view_file_source(json_file_dict: FileRequest = Body(...)):
            start_clock = datetime.now().timestamp()
            endpoint = '/api/v1/view_file_source'
            package_name = None
            file_name = None
            package_path = None
            try:
                package_name = json_file_dict.package
                file_name = json_file_dict.file
                manifest_path = json_file_dict.manifest_path

                package = self.packages.get(package_name)
                if package is None or package.python_path is None:
                    raise ValueError(f"Invalid package '{package_name}' for viewing source")
                package_path = package.path
                file_path = self._resolve_package_python_file(package_name, package, file_name, manifest_path)

                try:
                    with open(file_path, 'r', encoding=self._settings['text_encoding']) as file:
                        code = file.read()

                    highlighted_code = highlight_code(code, self._settings['visualize_whitespace'])

                    elapsed = datetime.now().timestamp() - start_clock
                    self._log_request(
                        logging.INFO,
                        endpoint,
                        elapsed,
                        success=True,
                        package=package_name,
                        file=file_name,
                    )
                    self._record_timing('viewer', endpoint, elapsed, True, package=package_name, file=file_name)
                    return self.api_success({'text': highlighted_code, 'file_path': file_path})
                except (OSError, ValueError, UnicodeError) as exc:
                    elapsed = datetime.now().timestamp() - start_clock
                    self._log_request(
                        logging.WARNING,
                        endpoint,
                        elapsed,
                        success=False,
                        package=package_name,
                        file=file_name,
                        error_type=type(exc).__name__,
                        error=str(exc),
                    )
                    self._record_timing('viewer', endpoint, elapsed, False, package=package_name, file=file_name, error=str(exc))
                    return self.api_failure(exc, data={'text': str(exc)})

            except (OSError, TypeError, ValueError, KeyError) as exc:
                elapsed = datetime.now().timestamp() - start_clock
                self._log_request(
                    logging.WARNING,
                    endpoint,
                    elapsed,
                    success=False,
                    package=package_name,
                    file=file_name,
                    package_path=package_path,
                    error_type=type(exc).__name__,
                    error=str(exc),
                )
                self._record_timing('viewer', endpoint, elapsed, False, package=package_name, file=file_name, error=str(exc))
                return self.api_failure(exc, data={'text': str(exc)})

        @app.post('/api/v1/behavior/code_generator')
        async def behavior_code_generator(request: Request, json_dict: BehaviorCodeGeneratorRequest = Body(...)):
            result_dict = {'install_success': False, 'error_msg': '',
                           'src_save_success': False, 'src_error_msg': ''}

            try:
                self.authorize_request(request)
                # Extract data from JSON dictionary body
                ws = json_dict.ws
                package_name = json_dict.package_name
                file_name = json_dict.file_name
                save_as = bool(json_dict.save_as)
                explicit_package = json_dict.explicit_package
                contained_behavior_names = json_dict.behavior_names
                print(' behavior_code_generator for '
                      f"'{ws}'/{package_name}/'{file_name}' (save_as={save_as}) ...", flush=True)

                # Allow access using attributes
                try:
                    behavior = Behavior(**json_dict.behavior)
                except (TypeError, ValueError, KeyError) as exc:
                    print(' Error processing behavior in behavior_code_generator '
                          f"for '{ws}'/{package_name}/'{file_name}' ...", flush=True)
                    print(exc, flush=True)
                    print('Failed!')
                    print('---------------------')
                    print(json.dumps(json_dict.behavior, indent=4), flush=True)
                    print('---------------------')
                    print(f'Failed to extract behavior: {exc}', flush=True)
                    result_dict.update({'error_msg': 'Failed to extract behavior', 'exception': str(exc)})
                    return self.api_success(result_dict)

                if package_name != behavior.behavior_package:
                    print(f"package name difference! '{package_name}' '{behavior.package_name}'", flush=True)

                package = self.packages.get(package_name)
                print(f'package: {package}', flush=True)
                if package is None or package.python_path is None:
                    raise ValueError(f"Invalid package '{package_name}' for behavior code generation")

                python_path = package.python_path
                behavior_file_name = ''
                if save_as or behavior.file_name is None:
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
                                   initialize_flexbe_core=self._settings['initialize_flexbe_core'],
                                   )
                cg.set_explicit_package(explicit_package)

                code = cg.generate_behavior_code(behavior, self._settings['license_text'])
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
                    return self.api_success(result_dict)

                manifest_path = ''
                if save_as or behavior.manifest_path is None:
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
                    return self.api_success(result_dict)

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
                            return self.api_success(result_dict)
                    else:
                        result_dict.update({'src_save_success': False,
                                            'src_error_msg': f'Cannot save in source code folder - '
                                                             f"'{source_code_root}' does not exist"})
                        return self.api_success(result_dict)

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
                        return self.api_success(result_dict)
                    try:
                        manifest_path = os.path.join(manifest_path, manifest_name)
                        with open(manifest_path, 'w', encoding=self._settings['text_encoding']) as fout:
                            print(f" Saving manifest file to '{manifest_path}' ...", flush=True)
                            fout.write(manifest_content)

                        python_file_path = os.path.join(python_path, file_name)
                        with open(python_file_path, 'w', encoding=self._settings['text_encoding']) as fout:
                            print(f" Saving behavior code to '{python_file_path}' ...", flush=True)
                            fout.write(code)
                    except (OSError, TypeError, ValueError) as exc:
                        result_dict.update({'src_save_success': False,
                                            'src_error_msg': f"Failed to save in source code folder - '{exc}'"})
                        return self.api_success(result_dict)

                    print(f"\x1b[92mSuccessfully saved behavior to '{package_folder}'!\x1b[0m")
                print(' done!', flush=True)
                result_dict.update({'src_save_success': True})
                return self.api_success(result_dict)
            except (AttributeError, IndexError, OSError, TypeError, ValueError, KeyError, RuntimeError) as exc:
                print(f" Exception generating code for '{file_name}' in '{package_name}'  -- {exc}", flush=True)
                import traceback
                print(traceback.format_exc().replace('%', '%%'), flush=True)
                print(30 * '-')
                print(json_dict.behavior, flush=True)
                result_dict.update({'error_msg': str(exc)})
                print(30 * '-', flush=True)
                return self.api_success(result_dict)

        @app.post('/api/v1/behavior/manifest_generator')
        async def behavior_manifest_generator(request: Request, json_manifest_dict: Dict = Body(...)):
            try:
                self.authorize_request(request)
                behavior = Behavior(**json_manifest_dict['behavior'])
                contained_behavior_names = json_manifest_dict['behavior_names']
                print(' Manifest_generator:  behavior_manifest_generator for '
                      f"'{behavior.behavior_package}/{behavior.behavior_name}' ...", flush=True)
            except (TypeError, ValueError, KeyError) as exc:
                print(' Manifest_generator: Exception generating manifest '
                      f'for:\n {json_manifest_dict} -- {exc}', flush=True)
                import traceback
                print(traceback.format_exc().replace('%', '%%'))
                return self.api_command_failure(exc)

            try:
                manifest_content = ''
                try:
                    ws = json_manifest_dict['ws']
                except KeyError:
                    print('Using default 4 spaces to generate the manifest!')
                    ws = '    '

                mg = ManifestGenerator(ws)

                package = self.packages.get(behavior.behavior_package)
                if package is None:
                    raise ValueError(f"Invalid package '{behavior.behavior_package}' for manifest generation")
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

                return self.api_command_success()
            except (OSError, TypeError, ValueError, KeyError, RuntimeError) as exc:
                print(f'Exception generating manifest for:\n {behavior.name} -- {exc}', flush=True)
                import traceback
                print(traceback.format_exc().replace('%', '%%'))
                return self.api_command_failure(exc)

    def authorize_request(self, request: Request):
        """Authorize mutating API requests when token auth is enabled."""
        if not self._api_token:
            return

        header_token = request.headers.get('x-api-token', '').strip()
        auth_header = request.headers.get('authorization', '').strip()
        bearer_token = ''
        if auth_header.lower().startswith('bearer '):
            bearer_token = auth_header[7:].strip()

        supplied_token = bearer_token or header_token
        if not supplied_token or not hmac.compare_digest(supplied_token, self._api_token):
            raise HTTPException(status_code=401, detail='Unauthorized')

    def run(self, port: int = 8000, host: str = '127.0.0.1', logging: str = 'warning'):
        """Run main web server loop."""
        print(f'  Configure uvicorn host/port={host}/{port} logging={logging} ...', flush=True)
        config = uvicorn.Config(self._app, host=host, port=port, log_level=logging)
        print('  Construct uvicorn server ...', flush=True)
        server = uvicorn.Server(config)
        print('  Run uvicorn server...', flush=True)
        server.run()
        print('  Done running uvicorn server.', flush=True)
        self._running = False


def parse_args(args: List[str] = None):
    """Parse command line arguments for webui_server and webui_node."""
    def parse_bool(value):
        if isinstance(value, bool):
            return value
        value = str(value).strip().lower()
        if value in ('true', '1', 'yes', 'y', 'on'):
            return True
        if value in ('false', '0', 'no', 'n', 'off'):
            return False
        raise argparse.ArgumentTypeError(f'Invalid boolean value: {value}')

    parser = argparse.ArgumentParser(description='FlexBE WebUI Server parameters')
    parser.add_argument('--port', type=str, default='8000', help="FlexBE WebUI Server port (default='8000')")
    parser.add_argument('--host', type=str, default='127.0.0.1',
                        help='IP address to bind the FlexBE WebUI server to (default: 127.0.0.1 - localhost)')
    parser.add_argument('--config_folder', type=str, default='',
                        help="FlexBE WebUI Server configuration file folder (default='' use 'flexbe_webui/config')")
    parser.add_argument('--config_file', type=str, default='',
                        help="FlexBE WebUI Server configuration file (default='' use default settings)")
    parser.add_argument('--clear_cache', type=parse_bool, nargs='?', const=True, default=False,
                        help='Clear existing package data cache and reprocess')

    VALID_LOGGING_LEVELS = ['critical', 'error', 'warning', 'info', 'debug', 'trace']

    def validate_logging_level(level: str) -> str:
        if level.lower() not in VALID_LOGGING_LEVELS:
            raise argparse.ArgumentTypeError(f"Invalid logging level: {level}. Choose from {', '.join(VALID_LOGGING_LEVELS)}")
        return level.lower()

    parser.add_argument('--logging_level', type=validate_logging_level, default='warning',
                        help=f"Set uvicorn logging level ({', '.join(VALID_LOGGING_LEVELS)})")

    return parser.parse_known_args(args=args)


def main(args: List[str] = None):
    """Run WebUI server in offline stand alone mode."""
    print('\nStarting FlexBE WebUI server ', end='', flush=True)
    args, _ = parse_args(args)
    print(f'  args: {args}', flush=True)

    try:
        port = int(args.port)
    except (TypeError, ValueError) as exc:
        print(f'\n  Invalid port = {args.port} - {exc}', flush=True)
        return

    try:
        host = str(args.host)
    except (TypeError, ValueError) as exc:
        print(f'\n  Invalid host = {args.host} - {exc}', flush=True)
        return

    print(f'at port={port} logging={args.logging_level} ...', flush=True)
    webui_server = WebuiServer(args)
    webui_server.run(port, host, args.logging_level)
    print('shutdown FlexBE WebUI server!', flush=True)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print(f'Keyboard interrupt request  at {datetime.now()} - ! Shut the flexbe webui server down!', flush=True)
    except BaseException as exc:  # noqa: B902
        if isinstance(exc, (SystemExit, KeyboardInterrupt)):
            raise
        print(f'Exception in executor       at {datetime.now()} - ! {type(exc)}\n  {exc}', flush=True)
        import traceback
        print(f"{traceback.format_exc().replace('%', '%%')}", flush=True)
