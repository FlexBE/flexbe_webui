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

"""Single pane client for FlexBE WebUI Server."""

import argparse
import asyncio
import os
import sys
import time
from datetime import datetime
from threading import Thread

from PySide6.QtCore import QTimer, QUrl, Qt, Signal, Slot
from PySide6.QtGui import QIcon
from PySide6.QtNetwork import QNetworkAccessManager, QNetworkReply, QNetworkRequest
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QMainWindow

from ament_index_python.packages import get_package_share_directory

import websockets


class FlexBEMainWindow(QMainWindow):
    """FlexBE Webview class."""

    _shutdown_signal = Signal()

    def __init__(self, args):
        """Initialize WebViewer instance."""
        super().__init__()

        self._browser = FlexBEWebView()
        self._browser.setPage(FlexBEWebEnginePage(self._browser, verbose=args.verbose))
        if args.clear_cache:
            QWebEngineProfile.defaultProfile().clearHttpCache()
        self._url = f'http://{args.url}:{args.port}'
        self._shutdown_query_url = f'ws://{args.url}:{args.port}/ws/check_shutdown'
        self._browser.setHtml('<html><body><h1>Waiting for FlexBE WebUI Server ...</h1></body></html>')
        self.setWindowTitle('FlexBE WebUI')
        self.setCentralWidget(self._browser)
        self.setMinimumSize(args.min_width, args.min_height)
        self.resize(args.width, args.height)

        # Start WebSocket listener for shutdown command
        self._is_shutting_down = False
        self._closing_process = False
        self._shutdown_signal.connect(self._quit_application)
        self._async_event_loop = asyncio.new_event_loop()
        self._shutdown_thread = Thread(target=self._start_shutdown_listener)

        # Poll for server startup, then load page
        self._connected = False
        self._network_manager = QNetworkAccessManager(self)
        self._timer = QTimer(self)
        self._timer.setInterval(500)  # Check every 500 milliseconds
        self._network_manager.finished.connect(self._handle_response)
        self._timer.timeout.connect(self._check_server_online)
        self._timer.start()

    def _check_server_online(self):
        """Verify server is online."""
        request = QNetworkRequest(QUrl(f'{self._url}/api/v1/ready'))
        self._network_manager.get(request)

    def _handle_response(self, reply):
        """Load webpage after server is online, or recheck server."""
        if reply.error() == QNetworkReply.NetworkError.NoError:
            self._load_web_view()
        else:
            self._timer.start()

    def _load_web_view(self):
        """Load webpage."""
        print(f"\x1b[92mFlexBE WebUI server @'{self._url}' is ready !\x1b[0m", flush=True)
        if self._timer is not None:
            self._timer.stop()
            self._timer = None

        self._browser.setUrl(QUrl(self._url))
        self._network_manager = None
        self._shutdown_thread.start()
        self._connected = True

    def closeEvent(self, event):
        """
        Handle close window request.

        This is called on X in window, but also after QApplication.instance.quit().
        use is_shutting_down flag to prevent recursive call.
        """
        if self._is_shutting_down or not self._connected:
            print('Final shutdown!', flush=True)
            event.accept()  # Accept the close command actually shutdown
            return

        # print('closeEvent from UI - initiate shutdown check logic ..', flush=True)
        event.ignore()  # We are going to handle the closeEvent based on response from UI
        if not self._closing_process:
            self._closing_process = True
            # print('process closeEvent from UI ...', flush=True)
            QTimer.singleShot(0, self._confirm_exit)  # Do this in QEventLoop after returning from here
        else:
            print('closeEvent from UI - but existing close event in process ..', flush=True)

    def _start_shutdown_listener(self):
        """
        Start listener for shutdown logic.

        The JavaScript code in UI will be checked in _confirm_exit, then shutdown
        relayed to server, which will send message to websocket to trigger actual shutdown.
        """
        print('\x1b[95mStart shutdown listener ...\x1b[0m', flush=True)
        asyncio.set_event_loop(self._async_event_loop)
        print('Running asyncio event loop for shutdown listener ...', flush=True)
        try:
            self._async_event_loop.run_until_complete(self._listen_for_shutdown())
        except Exception as exc:
            print(f'Exception in shutdown listener event loop: {exc}', flush=True)
        finally:
            print('Shutdown listener event loop clean up ...', flush=True)
            self._async_event_loop.run_until_complete(self._async_event_loop.shutdown_asyncgens())
            self._async_event_loop.close()
            print('\x1b[91mEmitting shutdown signal for UI\x1b[0m', flush=True)
            self._shutdown_signal.emit()
            print('Shutdown listener event loop closed', flush=True)

    async def _listen_for_shutdown(self):
        """Listen for shutdown command verified by server."""
        print(f'\x1b[95mSet up listener for shutdown command from {self._shutdown_query_url} ...\x1b[0m', flush=True)
        async with websockets.connect(self._shutdown_query_url) as websocket:
            print(f'Listening for shutdown command from {self._shutdown_query_url} ...', flush=True)
            while True:
                try:
                    message = await websocket.recv()
                    if message == 'Shutdown is allowed.':
                        if self._closing_process:
                            print('\x1b[91mShutdown ...\x1b[0m', flush=True)
                            break  # Finish with from listener thread to trigger shutdown
                        else:
                            print('\x1b[95mReceived shutdown signal with no active event - ignoring!\x1b[0m')
                    else:
                        if self._closing_process:
                            print('\x1b[95mRejecting close request\x1b[0m', flush=True)
                        else:
                            print('\x1b[95mReceived shutdown rejection with no active event - ignoring!\x1b[0m')
                    self._is_shutting_down = False
                    self._closing_process = False
                except asyncio.exceptions.IncompleteReadError as exc:
                    print(f'WebSocket IncompleteReadError closed: {exc}', flush=True)
                except websockets.exceptions.ConnectionClosed as exc:
                    print(f'WebSocket connection closed: {exc}', flush=True)
                    break
                except Exception as exc:
                    print(f'Unknown exception : {exc}', flush=True)

    @Slot()
    def _quit_application(self):
        print('Triggering shutdown ...', flush=True)
        self._is_shutting_down = True   # Allow closeEvent to accept closing
        QApplication.instance().quit()  # In PySide6, this triggers another closeEvent call

    def _confirm_exit(self):
        """Confirm exit request handling the close X request."""

        def handle_js_response(result):
            # Unlike, PyQT5, PySide6 does not return value here,
            # so depend we must on websocket from the server side to actually close window.
            # print(f"confirm_exit: handle js response = '{result}' ({type(result)}) - query server ...", flush=True)
            pass

        js_code = """
        // Call the JavaScript function defined in the loaded HTML
        (function() {
            console.log('Calling UI.Tools.confirmUIExit ...');
            let result = UI.Tools.confirmUIExit();
            console.log(`confirmUIExit = ${result}`);
        })();
        """
        # print('Received request to shutdown - confirm status ...', flush=True)
        self._browser.page().runJavaScript(js_code, 0, handle_js_response)


class FlexBEWebView(QWebEngineView):
    """Allow opening of external windows for code view."""

    def __init__(self, *args, **kwargs):
        """Initialize WebEngineView."""
        super().__init__(*args, **kwargs)
        self._externals = {}

    def createWindow(self, _type):
        """Create window."""
        new_webview = QWebEngineView()
        new_webview.setAttribute(Qt.WA_DeleteOnClose)
        new_webview.setPage(QWebEnginePage())
        new_window = ExternalMainWindow(new_webview, self)
        window_id = id(new_window)  # Get a unique ID for the new window
        self._externals[window_id] = new_window  # Store the new window in the dictionary
        return new_webview

    def cleanupWindow(self, window_id):
        """Clean up external window."""
        try:
            window = self._externals.pop(window_id)
            del window
        except Exception:
            print(f"Failed to delete window '{window_id}'", flush=True)


class FlexBEWebEnginePage(QWebEnginePage):
    """Allow console logging to terminal."""

    def __init__(self, *args, verbose=False, **kwargs):
        """Initialize page."""
        super().__init__(*args, **kwargs)
        self._verbose = verbose

    def javaScriptConsoleMessage(self, level: QWebEnginePage.JavaScriptConsoleMessageLevel, message: str,
                                 lineNumber: int, sourceID: str) -> None:
        """Show JavaScript console message in verbose."""
        if self._verbose:
            print(f'{level.value} : {message} --> {lineNumber} : {sourceID}', flush=True)
        return super().javaScriptConsoleMessage(level, message, lineNumber, sourceID)


class ExternalMainWindow(QMainWindow):
    """External code viewer."""

    def __init__(self, webview, parent, width=800, height=800):
        """Initialize main window."""
        super().__init__()
        self.setCentralWidget(webview)
        self._parent = parent
        self.resize(width, height)
        self.setWindowTitle('FlexBE Code Viewer')
        self.show()

    def closeEvent(self, event):
        """Close external window."""
        self._parent.cleanupWindow(id(self))
        event.accept()


def main(args=None):
    """Run main loop."""
    parser = argparse.ArgumentParser(description='FlexBE WebUI Client')
    parser.add_argument('--url', type=str, default='127.0.0.1', help="FlexBE WebUI Server URL (default='127.0.0.1')")
    parser.add_argument('--port', type=str, default='8000', help="FlexBE WebUI Server port (default='8000')")
    parser.add_argument('--width', type=int, default=1400, help='Window width (default=1400)')
    parser.add_argument('--height', type=int, default=800, help='UI window height (default=800)')
    parser.add_argument('--min_width', type=int, default=1000, help='Minimum UI window width (default=1000)')
    parser.add_argument('--min_height', type=int, default=900, help='Minimum UI window height (default=900)')
    parser.add_argument('--verbose', type=bool, default=True, help='Verbose output (default=True)')
    parser.add_argument('--clear_cache', type=bool, default=True, help='Clear JavaScript cache (default=True)')
    parser.add_argument('--client_delay', type=float, default=0.0, help='Delay client startup (default=0.0')

    args, unknown = parser.parse_known_args()

    if args.client_delay > 0.0:
        start = time.time()
        print(f'\x1b[91mAllow FlexBE WebUI client to start after delay'
              f' of {args.client_delay} seconds ..\x1b[0m', end='', flush=True)
        while time.time() - start < args.client_delay:
            print('.', end='', flush=True)
            time.sleep(min(args.client_delay, 0.5))

    print(f"\n\x1b[92mStarting FlexBE WebUI client instance for '{args.url}:{args.port}' ...\x1b[0m", flush=True)
    flexbe_icon_path = os.path.join(get_package_share_directory('flexbe_webui'), 'app/img/icon-128.png')

    app = QApplication(sys.argv)
    main_win = FlexBEMainWindow(args)
    app.setWindowIcon(QIcon(flexbe_icon_path))
    main_win.setWindowIcon(QIcon(flexbe_icon_path))

    main_win.show()  # Explicitly call show if not using showMaximized

    # Run the Qt application
    ret = app.exec_()
    print(f'FlexBE WebUI client application complete with ret={ret}', flush=True)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print(f'Keyboard interrupt request at {datetime.now()} - ! Shut the webui client down!', flush=True)
    except Exception as exc:
        print(f'Exception in executor at {datetime.now()} - ! {type(exc)}\n  {exc}', flush=True)
        import traceback
        print(f"{traceback.format_exc().replace('%', '%%')}", flush=True)
