import unittest
import json
import time
from detector import AnomalyDetector

class TestAnomalyDetector(unittest.TestCase):
    def setUp(self):
        self.detector = AnomalyDetector()
        # Bypass warmup for immediate testing or simulate passing of time
        self.detector.learning_period = 0 

    def test_frequency_anomaly(self):
        print("\nTesting Frequency Anomaly...")
        # Spam errors
        template = '{"level": "ERROR", "message": "Database connection failed", "module": "db"}'
        for _ in range(60): # Threshold is 50
            res = self.detector.check(template)
            
        self.assertIsNotNone(res)
        self.assertEqual(res['anomaly_type'], 'Frequency Anomaly')
        print("✅ Frequency Anomaly Detected")

    def test_novelty_anomaly(self):
        print("\nTesting Novelty Anomaly...")
        # Train with some logs
        self.detector.check('{"level": "INFO", "message": "User logged in"}')
        self.detector.check('{"level": "INFO", "message": "Request processed"}')
        
        # New weird log
        res = self.detector.check('{"level": "WARN", "message": "Unknown esoteric error occurred in flux capacitor"}')
        self.assertIsNotNone(res)
        self.assertEqual(res['anomaly_type'], 'Novel Log Template')
        print("✅ Novelty Anomaly Detected")

    def test_severity_mismatch(self):
        print("\nTesting Severity Mismatch...")
        res = self.detector.check('{"level": "ERROR", "message": "Operation completed successfully"}')
        self.assertIsNotNone(res)
        self.assertEqual(res['anomaly_type'], 'Severity Mismatch')
        print("✅ Severity Mismatch Detected")

    def test_sequence_anomaly(self):
        print("\nTesting Sequence Anomaly...")
        # Train sequence A -> B frequently
        log_a = '{"request_id": "req-1", "message": "Step A", "level": "INFO"}'
        log_b = '{"request_id": "req-1", "message": "Step B", "level": "INFO"}'
        
        # Simulate normal transitions A -> B
        for i in range(20):
            rid = f"trace-{i}"
            self.detector.check(f'{{"request_id": "{rid}", "message": "Step A", "level": "INFO"}}')
            self.detector.check(f'{{"request_id": "{rid}", "message": "Step B", "level": "INFO"}}')
            
        # Now do A -> C (rare)
        rid = "trace-weird"
        self.detector.check(f'{{"request_id": "{rid}", "message": "Step A", "level": "INFO"}}')
        res = self.detector.check(f'{{"request_id": "{rid}", "message": "Step C - Unexpected", "level": "INFO"}}')
        
        self.assertIsNotNone(res)
        self.assertEqual(res['anomaly_type'], 'Log-Sequence Anomaly')
        print("✅ Sequence Anomaly Detected")

if __name__ == '__main__':
    unittest.main()
