# Copyright 2026 Christopher Newport University
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

"""Optional browser-level smoke test for the live WebUI."""

import argparse
import contextlib
import os
import socket
import threading
import time
import urllib.request

from flexbe_webui.webui_server import WebuiServer

import pytest

import uvicorn


@contextlib.contextmanager
def _serve_webui(tmp_path):
    """Run the WebUI app on a temporary localhost port."""
    args = argparse.Namespace(
        config_folder=str(tmp_path),
        config_file='',
        clear_cache=True,
    )
    app = WebuiServer(args)._app

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(('127.0.0.1', 0))
        host, port = sock.getsockname()

    config = uvicorn.Config(app, host=host, port=port, log_level='error')
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    base_url = f'http://{host}:{port}'
    deadline = time.time() + 10.0
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f'{base_url}/api/v1/ready', timeout=0.5) as response:
                if response.status == 200:
                    break
        except OSError:
            time.sleep(0.1)
    else:
        server.should_exit = True
        thread.join(timeout=5)
        raise RuntimeError('Timed out waiting for browser smoke server startup')

    try:
        yield base_url
    finally:
        server.should_exit = True
        thread.join(timeout=5)


def test_browser_smoke(tmp_path):
    """Open the live app in a headless browser and verify core panels render."""
    if os.getenv('RUN_BROWSER_SMOKE') != '1':
        pytest.skip('set RUN_BROWSER_SMOKE=1 to enable the optional browser smoke test')

    playwright = pytest.importorskip('playwright.sync_api')

    with _serve_webui(tmp_path) as base_url:
        with playwright.sync_playwright() as runner:
            try:
                browser = runner.chromium.launch(headless=True)
            except (OSError, RuntimeError) as exc:  # pragma: no cover - depends on local browser install
                pytest.skip(f'playwright browser launch unavailable: {exc}')

            page = browser.new_page()
            try:
                page.goto(base_url, wait_until='networkidle')
                assert page.title() == 'FlexBE WebUI'
                page.locator('#button_to_se').click()
                assert page.locator('#settings').evaluate('el => el.style.left') == '0px'
                page.locator('#button_to_rc').click()
                assert page.locator('#runtimecontrol').evaluate('el => el.style.left') == '0px'
                page.locator('#button_to_db').click()
                assert page.locator('#dashboard').evaluate('el => el.style.left') == '0px'
            finally:
                browser.close()
