import time
import re
import os
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import logging

class LogEventHandler(FileSystemEventHandler):
    def __init__(self, file_path, callback):
        self.file_path = os.path.abspath(file_path)
        self.callback = callback
        self.file_handle = open(self.file_path, 'r')
        self.file_handle.seek(0, 2) # Start at end of file

    def on_modified(self, event):
        # Debug logging to see what watchdog sees
        logging.getLogger("Monitor").info(f"Event detected: {event.src_path}")
        
        # Watchdog returns absolute paths usually, but safe compare
        if os.path.abspath(event.src_path) == self.file_path:
            self.read_new_lines()

    def read_new_lines(self):
        for line in self.file_handle:
            if line.strip():
                self.callback(line)

class LogMonitor:
    def __init__(self, log_path, callback):
        self.log_path = log_path
        self.callback = callback
        self.observer = Observer()
        self.logger = logging.getLogger("Monitor")

    def start(self):
        self.logger.info(f"Starting watch on {self.log_path}")
        folder = os.path.dirname(os.path.abspath(self.log_path))
        event_handler = LogEventHandler(self.log_path, self.callback)
        self.observer.schedule(event_handler, path=folder, recursive=False)
        self.observer.start()

    def stop(self):
        self.observer.stop()
        self.observer.join()
