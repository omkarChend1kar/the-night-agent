"""
Log Monitor - Production-Ready File Tail with Auto-Restart

Features:
- Uses tail -F for reliable log following
- Auto-restarts on process failure
- Graceful shutdown support
- Configurable restart delay
"""

import time
import subprocess
import threading
import logging
import os

logger = logging.getLogger("Monitor")


class LogMonitor:
    """
    Monitors a log file using tail -F and calls a callback for each line.
    Supports auto-restart on failure and graceful shutdown.
    """
    
    def __init__(self, log_path, callback, auto_restart=True, restart_delay=5):
        """
        Args:
            log_path: Path to the log file to monitor
            callback: Function to call for each log line
            auto_restart: Whether to restart tail on failure
            restart_delay: Seconds to wait before restart
        """
        self.log_path = log_path
        self.callback = callback
        self.auto_restart = auto_restart
        self.restart_delay = restart_delay
        
        self.process = None
        self._stop_event = threading.Event()
        self.thread = None
        self._restart_count = 0
        self._max_restarts = 10  # Max restarts before giving up

    def start(self):
        """Start the monitoring thread"""
        self._stop_event.clear()
        self.thread = threading.Thread(target=self._monitor_loop, daemon=True, name="LogMonitor")
        self.thread.start()
        logger.info(f"📡 Log monitor started for: {self.log_path}")

    def _run_tail(self):
        """Run a single tail process and read its output"""
        logger.debug(f"Starting tail -F on {self.log_path}")
        
        # -F follows by name and retries if file is recreated
        # -n 0 starts from end of file (no history)
        cmd = ["tail", "-F", "-n", "0", self.log_path]
        
        try:
            self.process = subprocess.Popen(
                cmd, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE,
                universal_newlines=True,
                bufsize=1  # Line buffered
            )
            
            while not self._stop_event.is_set():
                line = self.process.stdout.readline()
                
                if not line:
                    # Check if process died
                    if self.process.poll() is not None:
                        exit_code = self.process.returncode
                        logger.warning(f"⚠️ tail process exited with code {exit_code}")
                        return False  # Indicate failure
                    time.sleep(0.1)
                    continue
                
                line = line.strip()
                if line:
                    try:
                        self.callback(line)
                    except Exception as e:
                        logger.error(f"Callback error: {e}")
            
            return True  # Normal exit (stop requested)
                    
        except FileNotFoundError:
            logger.error(f"❌ tail command not found - is tail installed?")
            return False
        except Exception as e:
            logger.error(f"❌ Error in tail process: {e}")
            return False
        finally:
            self._cleanup_process()

    def _monitor_loop(self):
        """Main monitoring loop with auto-restart support"""
        self._restart_count = 0
        
        while not self._stop_event.is_set():
            success = self._run_tail()
            
            if self._stop_event.is_set():
                break
                
            if not success and self.auto_restart:
                self._restart_count += 1
                
                if self._restart_count > self._max_restarts:
                    logger.error(f"❌ Max restarts ({self._max_restarts}) exceeded, giving up")
                    break
                
                logger.info(f"🔄 Restarting tail in {self.restart_delay}s (attempt {self._restart_count}/{self._max_restarts})")
                
                # Wait before restart, but check stop event periodically
                for _ in range(self.restart_delay):
                    if self._stop_event.is_set():
                        break
                    time.sleep(1)
            elif not success:
                logger.error("❌ Monitor failed and auto_restart is disabled")
                break
        
        logger.info("📴 Monitor loop exited")

    def _cleanup_process(self):
        """Clean up the tail subprocess"""
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
            except Exception:
                pass
            self.process = None

    def stop(self):
        """Stop the monitor gracefully"""
        logger.info("🛑 Stopping log monitor...")
        self._stop_event.set()
        self._cleanup_process()
        
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=5)
        
        logger.info("✅ Log monitor stopped")

    def is_running(self):
        """Check if the monitor is still running"""
        return self.thread and self.thread.is_alive()

    def get_restart_count(self):
        """Get the number of times the monitor has restarted"""
        return self._restart_count
