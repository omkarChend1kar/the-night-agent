
from bedrock_agent import BedrockAgent
import requests
import json
import logging
import os

class ValidatorAgent(BedrockAgent):
    def __init__(self):
        super().__init__(model_name="gemma_3_12b_it")
        # specific to Kestra in Docker, but allow override
        self.api_url = os.getenv("API_URL", "http://localhost:3001/api/internal")

    def run(self):
        self.logger.info("Fetching pending anomalies...")
        try:
            # In Kestra, we might pass this as input, but for script we fetch
            res = requests.get(f"{self.api_url}/anomalies/pending")
            anomalies = res.json()
        except Exception as e:
            self.logger.error(f"Failed to fetch anomalies: {e}")
            return

        self.logger.info(f"Validating {len(anomalies)} anomalies...")
        
        for anomaly in anomalies:
            self.validate(anomaly)

    def validate(self, anomaly):
        print(f"INFO:ValidatorAgent:Validating anomaly {anomaly['id']}...")
        
        prompt = f"""
        You are a Principal Site Reliability Engineer (SRE).
        Your job is to VALIDATE if a reported anomaly is a REAL CRITICAL INCIDENT or just noise.
        
        STRICT FILTERING CRITERIA:
        Mark as CRITICAL *ONLY* if the logs show one of these specific issues:
        1. API Validation Errors (e.g. 400 Bad Request with validation details).
        2. Application Server is down or restarting unexpectedly.
        3. Database Connection failures (ORM errors, connection refused).
        4. Critical Service-to-Service connection failures.
        
        IGNORE everything else, including:
        - Single 404s or 500s without clear pattern.
        - "Novelty" anomalies just because a log is new.
        - Warnings or Info logs.
        - Transient network blips.
        
        CONTEXT:
        {json.dumps(anomaly, indent=2)}
        
        Repo URL: {anomaly.get('repoUrl', 'unknown')}
        
        OUTPUT FORMAT:
        Return valid JSON only.
        {{
            "decision": "CRITICAL" | "IGNORE",
            "reasoning": "Brief explanation of why it fits the criteria or why it is noise"
        }}
        """
        """
        
        response_text = self.invoke(prompt)
        if not response_text: return

        try:
            # Simple cleanup if the model acts up
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                 response_text = response_text.split("```")[1].split("```")[0].strip()

            result = json.loads(response_text)
            decision = result.get('decision', 'IGNORE')
            reasoning = result.get('reasoning', 'No reasoning provided')
            
            print(f"INFO:ValidatorAgent:Service: {anomaly.get('serviceId')} | Anomaly {anomaly['id']} -> {decision} | {reasoning[:50]}...")
            
            self.save_review(anomaly['id'], decision, reasoning)

        except Exception as e:
            print(f"ERROR:ValidatorAgent:Failed to parse LLM response: {e}")
            print(f"DEBUG:ValidatorAgent:Raw Response: {response_text}")

    def save_review(self, anomaly_id, decision, reasoning):
        payload = {
            "id": anomaly_id,
            "decision": decision,
            "reasoning": reasoning
        }
        try:
            res = requests.post(f"{self.api_url}/anomalies/review", json=payload)
            res.raise_for_status()
            print(f"INFO:ValidatorAgent:Review saved: {res.status_code}")
        except Exception as e:
            print(f"ERROR:ValidatorAgent:Review failed ({getattr(e.response, 'status_code', 'N/A')}): {getattr(e.response, 'text', str(e))}")

if __name__ == "__main__":
    ValidatorAgent().run()
