
from bedrock_agent import BedrockAgent
import requests
import json
import logging
import os
import sys

class AnalystAgent(BedrockAgent):
    def __init__(self):
        super().__init__(model_name="mistral_large_3")
        self.api_url = os.getenv("API_URL", "http://localhost:3001/api/internal")

    def run(self, anomaly_id=None):
        if anomaly_id:
            self.analyze_single(anomaly_id)
        else:
            self.logger.info("Batch mode not implemented for Analyst yet.")

    def analyze_single(self, anomaly_id):
        self.logger.info(f"Fetching anomaly {anomaly_id}...")
        try:
            res = requests.get(f"{self.api_url}/anomalies/{anomaly_id}")
            anomaly = res.json()
        except Exception as e:
            self.logger.error(f"Failed to fetch anomaly: {e}")
            return

        print(f"INFO:AnalystAgent:Analyzing anomaly {anomaly['id']}...")
        
        prompt = f"""
        You are a Principal Software Engineer doing Root Cause Analysis (RCA).
        
        ANOMALY:
        {json.dumps(anomaly, indent=2)}
        
        REPO URL: {anomaly.get('repoUrl', 'unknown')}
        
        TASK:
        Analyze the logs and context provided. 
        Identify the Root Cause and suggest a fix.
        
        OUTPUT FORMAT (JSON ONLY):
        {{
            "root_cause": "Detailed technical explanation of the bug. Be specific (e.g. 'Memory leak in loop', 'Null pointer in user handler').",
            "relevant_files": ["src/service/foo.ts", "src/api/bar.ts"],
            "suggested_fix": "Step-by-step description of how to fix the code."
        }}
        """
        
        response_text = self.invoke(prompt)
        if not response_text: return

        try:
            # Cleanup markdown
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                 response_text = response_text.split("```")[1].split("```")[0].strip()

            analysis = json.loads(response_text)
            
            # Print for Kestra capture if needed (though we save via API)
            print(f"ANALYSIS_OUTPUT:{json.dumps(analysis)}")
            
            self.save_analysis(anomaly['id'], analysis)

        except Exception as e:
            print(f"ERROR:AnalystAgent:Failed to parse LLM response: {e}")
            print(f"DEBUG:AnalystAgent:Raw Response: {response_text}")

    def save_analysis(self, anomaly_id, analysis):
        payload = {
            "id": anomaly_id,
            "analysis": analysis 
        }
        try:
            res = requests.post(f"{self.api_url}/anomalies/analysis", json=payload)
            res.raise_for_status()
            print(f"INFO:AnalystAgent:Analysis saved: {res.status_code}")
        except Exception as e:
            print(f"ERROR:AnalystAgent:Save failed: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        AnalystAgent().run(sys.argv[1])
    else:
        print("Usage: python analyst_agent.py <anomaly_id>")
