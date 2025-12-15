"""
Anomaly Detector - Production-Ready Statistical Log Analysis

Features:
- 6 detection rules (Frequency, Novelty, Severity Mismatch, Sequence, Latency, Tenant)
- Configurable thresholds via config dict
- Consistent template hashing with hashlib
- Warmup/learning period before alerting
"""

import re
import time
import json
import logging
import hashlib
from collections import defaultdict, deque
from datetime import datetime

logger = logging.getLogger("Detector")


class FeatureExtractor:
    """Extracts structured features from raw log lines"""
    
    def __init__(self):
        # Regex patterns
        self.ts_pattern = re.compile(
            r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?'
        )
        self.uuid_pattern = re.compile(
            r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 
            re.IGNORECASE
        )
        self.ip_pattern = re.compile(r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}')
        self.digit_pattern = re.compile(r'\b\d+\b')
        self.hex_pattern = re.compile(r'\b0x[0-9a-f]+\b', re.IGNORECASE)

    def extract_timestamp_value(self, text, json_data=None):
        """Extract timestamp from log line or JSON data"""
        ts_str = None
        
        if json_data:
            for key in ['timestamp', 'time', 'date', 'ts', '@timestamp']:
                if key in json_data:
                    ts_str = json_data[key]
                    break
        
        if not ts_str:
            match = self.ts_pattern.search(text)
            if match:
                ts_str = match.group(0)

        if ts_str:
            try:
                return datetime.fromisoformat(ts_str.replace('Z', '+00:00')).timestamp()
            except (ValueError, TypeError):
                pass
        
        return time.time()

    def normalize_message(self, message):
        """Mask variable parts to create a template for grouping similar logs"""
        msg = self.uuid_pattern.sub('<UUID>', message)
        msg = self.ip_pattern.sub('<IP>', msg)
        msg = self.hex_pattern.sub('<HEX>', msg)
        msg = self.digit_pattern.sub('<NUM>', msg)
        return msg.strip()

    def extract_severity(self, line, json_data=None):
        """Extract log severity from various formats"""
        # Try JSON fields first
        if json_data:
            for key in ['level', 'severity', 'log_level', 'loglevel']:
                if key in json_data:
                    return str(json_data[key]).upper()
        
        # Pattern matching for common log formats
        line_upper = line.upper()
        
        if '❌' in line or 'CRITICAL:' in line_upper or 'FATAL:' in line_upper:
            return 'CRITICAL'
        elif 'ERROR:' in line_upper or 'ERROR ' in line_upper or '[ERROR]' in line_upper:
            return 'ERROR'
        elif '⚠️' in line or 'WARN:' in line_upper or 'WARNING:' in line_upper or '[WARN]' in line_upper:
            return 'WARN'
        elif 'DEBUG:' in line_upper or '[DEBUG]' in line_upper:
            return 'DEBUG'
        elif 'INFO:' in line_upper or '[INFO]' in line_upper:
            return 'INFO'
        
        return 'INFO'  # Default

    def parse(self, raw_line):
        """Parse a raw log line into structured features"""
        line = raw_line.strip()
        json_data = None
        
        # Try JSON parsing
        try:
            json_data = json.loads(line)
        except json.JSONDecodeError:
            pass

        # Extract message
        if json_data:
            message = json_data.get('message', json_data.get('msg', line))
        else:
            message = line

        # Extract severity
        severity = self.extract_severity(line, json_data)
        
        # Build features dict
        features = {
            'raw': line,
            'timestamp': self.extract_timestamp_value(line, json_data),
            'severity': severity,
            'message': message,
            'module': (json_data or {}).get('module', 
                      (json_data or {}).get('component', 
                      (json_data or {}).get('logger', 'unknown'))),
            'request_id': (json_data or {}).get('request_id',
                          (json_data or {}).get('trace_id',
                          (json_data or {}).get('traceId',
                          (json_data or {}).get('correlation_id', None)))),
            'user_id': (json_data or {}).get('user_id',
                       (json_data or {}).get('userId',
                       (json_data or {}).get('tenant_id',
                       (json_data or {}).get('tenantId', None)))),
        }
        
        # Derived features
        features['template'] = self.normalize_message(message)
        # Use hashlib for consistent hashing (Python's hash() varies between runs)
        features['template_id'] = hashlib.md5(features['template'].encode()).hexdigest()[:16]
        
        # Numeric severity for comparisons
        sev_map = {'DEBUG': 10, 'INFO': 20, 'WARN': 30, 'WARNING': 30, 'ERROR': 40, 'CRITICAL': 50, 'FATAL': 50}
        features['severity_score'] = sev_map.get(features['severity'], 20)

        return features


class ContextEngine:
    """Maintains sliding window context for anomaly detection"""
    
    def __init__(self, history_window=300):
        self.template_stats = defaultdict(lambda: {
            'count': 0, 
            'last_seen': 0, 
            'deltas': deque(maxlen=50),
            'transitions': defaultdict(int),
            'users': set()
        })
        self.request_traces = defaultdict(list)
        self.recent_logs = deque(maxlen=5000)
        self.history_window = history_window
        self.last_log_time = time.time()

    def update(self, features):
        """Update context with new log features"""
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
        
        # Update request traces & transitions
        rid = features['request_id']
        if rid:
            trace = self.request_traces[rid]
            if trace:
                prev_tid = trace[-1]['template_id']
                self.template_stats[prev_tid]['transitions'][tid] += 1
            
            trace.append(features)
            
            # Cleanup old traces (keep last 500 active requests)
            if len(self.request_traces) > 500:
                oldest_keys = list(self.request_traces.keys())[:100]
                for k in oldest_keys:
                    del self.request_traces[k]

        # Update sliding window
        self.recent_logs.append((now, tid))
        
        # Prune old entries
        while self.recent_logs and self.recent_logs[0][0] < now - self.history_window:
            self.recent_logs.popleft()
            
        self.last_log_time = now

    def get_template_frequency(self, template_id):
        """Count occurrences of a template in the current window"""
        return sum(1 for _, tid in self.recent_logs if tid == template_id)


class AnomalyDetector:
    """Main anomaly detection engine with configurable thresholds"""
    
    DEFAULT_CONFIG = {
        "learning_period": 300,  # 5 minutes
        "freq_threshold_error": 50,
        "freq_threshold_flood": 200,
        "latency_threshold": 5.0,
        "sequence_prob_threshold": 0.05,
    }
    
    def __init__(self, config=None):
        self.config = {**self.DEFAULT_CONFIG, **(config or {})}
        self.extractor = FeatureExtractor()
        self.context = ContextEngine()
        self.start_time = time.time()
        
        logger.info(f"🔧 Detector initialized with config: {self.config}")

    def is_warmup(self):
        """Check if we're still in the learning period"""
        return (time.time() - self.start_time) < self.config['learning_period']

    def check(self, raw_log):
        """
        Check a log line for anomalies.
        Returns anomaly dict if found, None otherwise.
        """
        features = self.extractor.parse(raw_log)
        self.context.update(features)
        
        anomalies = []
        is_warmup = self.is_warmup()
        
        tid = features['template_id']
        stats = self.context.template_stats[tid]
        freq = self.context.get_template_frequency(tid)

        # === RULE 1: Frequency Anomaly ===
        freq_error = self.config['freq_threshold_error']
        freq_flood = self.config['freq_threshold_flood']
        
        if (freq > freq_error and features['severity_score'] >= 40) or freq > freq_flood:
            anomalies.append({
                "type": "Frequency Anomaly",
                "confidence": 0.9 if features['severity_score'] >= 40 else 0.7,
                "summary": f"High frequency: {freq} times in 5m. Template: {features['template'][:50]}..."
            })

        # === RULE 2: Novelty Anomaly ===
        if stats['count'] == 1 and not is_warmup:
            conf = 0.8 if features['severity_score'] >= 30 else 0.5
            anomalies.append({
                "type": "Novel Log Template",
                "confidence": conf,
                "summary": f"New log pattern: {features['template'][:60]}..."
            })

        # === RULE 3: Severity-Context Mismatch ===
        msg_lower = features['message'].lower()
        if features['severity'] == 'ERROR' and ('success' in msg_lower or '200' in features['message']):
            anomalies.append({
                "type": "Severity Mismatch",
                "confidence": 0.85,
                "summary": f"Marked ERROR but message implies success"
            })

        # === RULE 4: Sequence Anomaly (Rare Transition) ===
        if features['request_id'] and not is_warmup:
            rid = features['request_id']
            trace = self.context.request_traces[rid]
            
            if len(trace) > 1:
                prev_tid = trace[-2]['template_id']
                prev_stats = self.context.template_stats[prev_tid]
                
                total_transitions = sum(prev_stats['transitions'].values())
                if total_transitions > 10:
                    count = prev_stats['transitions'].get(tid, 0)
                    prob = count / total_transitions
                    
                    if prob < self.config['sequence_prob_threshold']:
                        anomalies.append({
                            "type": "Log-Sequence Anomaly",
                            "confidence": 0.75,
                            "summary": f"Rare sequence detected (prob: {prob:.2%})"
                        })

        # === RULE 5: Latency Anomaly ===
        if features['request_id']:
            trace = self.context.request_traces[features['request_id']]
            
            if len(trace) > 1:
                curr_ts = features['timestamp']
                prev_ts = trace[-2]['timestamp']
                delta = curr_ts - prev_ts
                
                if delta > self.config['latency_threshold']:
                    anomalies.append({
                        "type": "Latency Anomaly",
                        "confidence": 0.6,
                        "summary": f"High latency between logs: {delta:.2f}s"
                    })

        # === RULE 6: Tenant-Localized Anomaly ===
        if features['severity_score'] >= 40 and len(stats['users']) == 1 and stats['count'] > 5 and not is_warmup:
            anomalies.append({
                "type": "Tenant-Localized Anomaly",
                "confidence": 0.8,
                "summary": f"Error localized to single user: {list(stats['users'])[0]}"
            })

        # Return highest confidence anomaly
        if anomalies:
            top = max(anomalies, key=lambda x: x['confidence'])
            return {
                "anomaly_type": top['type'],
                "confidence": top['confidence'],
                "context": {
                    "time_window": "5m",
                    "log_template": features['template'],
                    "severity": features['severity']
                },
                "evidence": {
                    "log": features['raw'],
                    "frequency": freq,
                    "template_count": stats['count']
                },
                "summary": top['summary']
            }
            
        return None
