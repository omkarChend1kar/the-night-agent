import time
import subprocess
import threading
import logging
import os

logger = logging.getLogger("Monitor")

class LogMonitor:
    def __init__(self, log_path, callback):
        self.log_path = log_path
        self.callback = callback
        self.process = None
        self._stop_event = threading.Event()
        self.thread = None

    def start(self):
        self.thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.thread.start()

    def _monitor_loop(self):
        logger.info(f"Starting tail -F on {self.log_path}")
        
        # specific command to follow by name (-F) and retry if missing
        cmd = ["tail", "-F", "-n", "0", self.log_path]
        
        try:
            # Use bufsize=1 for line buffering
            self.process = subprocess.Popen(
                cmd, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE,
                universal_newlines=True, # text mode
                bufsize=1
            )
            
            # Read stdout line by line
            while not self._stop_event.is_set():
                line = self.process.stdout.readline()
                if not line:
                    if self.process.poll() is not None:
                        # Process exited
                        logger.warning("tail process exited, restarting in 1s...")
                        time.sleep(1)
                        # primitive restart logic could go here, but for now we break
                        break
                    time.sleep(0.1)
                    continue
                    
                line = line.strip()
                if line:
                    self.callback(line)
                    
        except Exception as e:
            logger.error(f"Error in tail process: {e}")
        finally:
            self.stop()

    def stop(self):
        self._stop_event.set()
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=1)
            except:
                pass
            self.process = None

