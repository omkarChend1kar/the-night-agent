import re
import time
import json
import logging
import math
from collections import defaultdict, deque, Counter
from datetime import datetime

logger = logging.getLogger("Detector")

class FeatureExtractor:
    def __init__(self):
        # Regex for generic timestamp (ISO 8601ish)
        self.ts_pattern = re.compile(r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?')
        # Regex to variable masking
        self.uuid_pattern = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', re.IGNORECASE)
        self.ip_pattern = re.compile(r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}')
        self.digit_pattern = re.compile(r'\b\d+\b')
        self.hex_pattern = re.compile(r'\b0x[0-9a-f]+\b', re.IGNORECASE)

    def extract_timestamp_value(self, text, json_data=None):
        ts_str = None
        if json_data:
            for key in ['timestamp', 'time', 'date', 'ts']:
                if key in json_data:
                    ts_str = json_data[key]
                    break
        
        if not ts_str:
            match = self.ts_pattern.search(text)
            if match:
                ts_str = match.group(0)

        # Try to parse into float time
        if ts_str:
            try:
                # Handle ISO format
                # Minimal parser for example
                return datetime.fromisoformat(ts_str.replace('Z', '+00:00')).timestamp()
            except:
                pass
        return time.time()

    def normalize_message(self, message):
        """Masks IDs, numbers, IPs to generate a template ID."""
        msg = self.uuid_pattern.sub('<UUID>', message)
        msg = self.ip_pattern.sub('<IP>', msg)
        msg = self.hex_pattern.sub('<HEX>', msg)
        msg = self.digit_pattern.sub('<NUM>', msg)
        return msg.strip()

    def parse(self, raw_line):
        """
        Extracts structured features from a raw log line.
        """
        line = raw_line.strip()
        data = {}
        
        # specific extraction for valid JSON
        try:
            json_data = json.loads(line)
            data.update(json_data)
        except json.JSONDecodeError:
            # Fallback for plain text
            data['message'] = line

        # Extract severity from log line if not in JSON
        detected_severity = data.get('level', data.get('severity', None))
        if not detected_severity:
            # Try to detect severity from log message text
            line_upper = line.upper()
            if '❌' in line or 'ERROR:' in line_upper or 'ERROR ' in line_upper:
                detected_severity = 'ERROR'
            elif '⚠️' in line or 'WARN:' in line_upper or 'WARNING:' in line_upper:
                detected_severity = 'WARN'
            elif 'CRITICAL:' in line_upper or 'FATAL:' in line_upper:
                detected_severity = 'CRITICAL'
            elif 'INFO:' in line_upper:
                detected_severity = 'INFO'
            elif 'DEBUG:' in line_upper:
                detected_severity = 'DEBUG'
            else:
                detected_severity = 'INFO'  # Default
        
        # Standardize fields
        features = {
            'raw': line,
            'timestamp': self.extract_timestamp_value(line, data),
            'severity': detected_severity.upper(),
            'message': data.get('message', data.get('msg', line)),
            'module': data.get('module', data.get('component', 'unknown')),
            'request_id': data.get('request_id', data.get('trace_id', data.get('traceId', None))),
            'user_id': data.get('user_id', data.get('userId', data.get('tenant_id', None))),
        }
        
        # Derived features
        features['template'] = self.normalize_message(features['message'])
        features['template_id'] = hash(features['template'])
        
        # Numeric severity
        sev_map = {'DEBUG': 10, 'INFO': 20, 'WARN': 30, 'WARNING': 30, 'ERROR': 40, 'CRITICAL': 50, 'FATAL': 50}
        features['severity_score'] = sev_map.get(features['severity'], 20)

        return features

class ContextEngine:
    def __init__(self, history_window=300): # 5 minutes default
        self.template_stats = defaultdict(lambda: {
            'count': 0, 
            'last_seen': 0, 
            'deltas': deque(maxlen=50),
            'transitions': defaultdict(int), # next_template_id -> count
            'users': set()
        })
        self.request_traces = defaultdict(list) # request_id -> [logs]
        self.recent_logs = deque(maxlen=2000)   # For sliding window counts
        self.history_window = history_window
        self.last_log_time = time.time()

    def update(self, features):
        now = features['timestamp']
        tid = features['template_id']
        
        # Update template stats
        stats = self.template_stats[tid]
        if stats['last_seen'] > 0:
            delta = now - stats['last_seen']
            if delta >= 0:
                stats['deltas'].append(delta)
        stats['last_seen'] = now
        stats['count'] += 1
        if features['user_id']:
            stats['users'].add(features['user_id'])
        
        # Update request traces & Transitions
        rid = features['request_id']
        if rid:
            trace = self.request_traces[rid]
            if trace:
                prev_tid = trace[-1]['template_id']
                self.template_stats[prev_tid]['transitions'][tid] += 1
            
            trace.append(features)
            # Cleanup old traces (simple logic: keep last 100 active requests)
            if len(self.request_traces) > 500:
                # Remove oldest modified
                pass # Skip complex cleanup for MVP

        # Update sliding window
        self.recent_logs.append((now, tid))
        # prune old
        while self.recent_logs and self.recent_logs[0][0] < now - self.history_window:
            self.recent_logs.popleft()
            
        self.last_log_time = now

    def get_template_frequency(self, template_id):
        # Count occurrences in current window
        count = sum(1 for _, tid in self.recent_logs if tid == template_id)
        return count

class AnomalyDetector:
    def __init__(self):
        self.extractor = FeatureExtractor()
        self.context = ContextEngine()
        self.learning_period = 60 # seconds
        self.start_time = time.time()

    def check(self, raw_log):
        features = self.extractor.parse(raw_log)
        self.context.update(features)
        
        anomalies = []
        is_warmup = (time.time() - self.start_time) < self.learning_period
        
        tid = features['template_id']
        stats = self.context.template_stats[tid]

        # 1. Frequency Anomaly
        freq = self.context.get_template_frequency(tid)
        # Threshold: > 50 in 5m AND Error OR > 200 in 5m (Flood)
        if (freq > 50 and features['severity_score'] >= 40) or freq > 200:
             anomalies.append({
                "type": "Frequency Anomaly",
                "confidence": 0.9 if features['severity_score'] >= 40 else 0.7,
                "summary": f"High frequency: {freq} times in 5m. Template: {features['template'][:50]}..."
            })
        
        # 2. Novelty Anomaly
        if stats['count'] == 1 and not is_warmup:
             # Only alert if it looks actionable (WARN/ERROR) or very weird structure
             conf = 0.5
             if features['severity_score'] >= 30:
                 conf = 0.8
             
             anomalies.append({
                "type": "Novel Log Template",
                "confidence": conf,
                "summary": f"New structured log pattern seen: {features['template'][:60]}..."
            })

        # 3. Severity-Context Anomaly
        if features['severity'] == 'ERROR' and ('success' in features['message'].lower() or '200' in features['message']):
             anomalies.append({
                "type": "Severity Mismatch",
                "confidence": 0.85,
                "summary": f"Marked ERROR but message implies success."
            })

        # 4. Sequence Anomaly (Transition Probability)
        if features['request_id'] and not is_warmup:
            rid = features['request_id']
            trace = self.context.request_traces[rid]
            if len(trace) > 1:
                prev_tid = trace[-2]['template_id'] # -1 is current
                prev_stats = self.context.template_stats[prev_tid]
                
                # Check if this transition is rare
                total_transitions = sum(prev_stats['transitions'].values())
                if total_transitions > 10: # Sufficient sample
                    count = prev_stats['transitions'].get(tid, 0)
                    prob = count / total_transitions
                    if prob < 0.05: # Less than 5% probability
                         anomalies.append({
                            "type": "Log-Sequence Anomaly",
                            "confidence": 0.75,
                            "summary": f"Rare sequence: {trace[-2]['template'][:30]}... -> {features['template'][:30]}... (Prob: {prob:.2f})"
                        })

        # 5. Latency Anomaly (Implicit)
        if features['request_id']:
            trace = self.context.request_traces[features['request_id']]
            if len(trace) > 1:
                curr_ts = features['timestamp']
                prev_ts = trace[-2]['timestamp']
                delta = curr_ts - prev_ts
                
                # Compare to average delta for this pair of templates?
                # Or just absolute threshold for now for simplicity
                if delta > 5.0: # 5 seconds gap in log stream for same request
                     anomalies.append({
                        "type": "Latency Anomaly",
                        "confidence": 0.6,
                        "summary": f"High latency between logs: {delta:.2f}s"
                    })

        # 6. Tenant-Localized Anomaly
        # If error is specific to one user (naive check: if this error seen for < 3 users but high count)
        if features['severity_score'] >= 40 and len(stats['users']) == 1 and stats['count'] > 5 and not is_warmup:
             anomalies.append({
                "type": "Tenant-Localized Anomaly",
                "confidence": 0.8,
                "summary": f"Error localized to single user: {list(stats['users'])[0]}"
            })

        if anomalies:
            # Return the highest confidence anomaly
            top = max(anomalies, key=lambda x: x['confidence'])
            return {
                "anomaly_type": top['type'],
                "confidence": top['confidence'],
                "context": {
                    "time_window": "5m",
                    "log_template": features['template']
                },
                "evidence": {
                    "log": features['raw'],
                    "frequency": freq,
                    "count": stats['count']
                },
                "summary": top['summary']
            }
            
        return None
