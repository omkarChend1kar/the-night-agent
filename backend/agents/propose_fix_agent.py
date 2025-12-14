
import subprocess
import os
import json
import logging
import base64
import requests

class ProposeFixAgent:
    def __init__(self):
        self.logger = logging.getLogger("ProposeFixAgent")
        logging.basicConfig(level=logging.INFO)
        # Assuming backend is running locally
        self.api_url = os.getenv("API_URL", "http://localhost:3001/api/internal")

    def run(self, anomaly_id):
        """
        Input: Anomaly ID
        Action: 
          1. Fetch Anomaly from Backend.
          2. Extract Root Cause Analysis from Context.
          3. Run Cline.
          4. Print output patch.
        """
        self.logger.info(f"Fetching anomaly {anomaly_id}...")
        try:
            res = requests.get(f"{self.api_url}/anomalies/{anomaly_id}")
            if not res.ok:
                self.logger.error(f"Failed to fetch anomaly: {res.status_code}")
                return
            
            anomaly = res.json()
            # The getAnomaly API spreads the context into the response object
            # So root_cause_analysis is at the top level, not inside context
            analysis = anomaly.get('root_cause_analysis')
            
            if not analysis:
                self.logger.error("No Root Cause Analysis found in anomaly context.")
                # Fallback? Maybe try to use 'judge_reasoning' or just fail?
                # User wants strict flow. Fail.
                return
                
        except Exception as e:
            self.logger.error(f"Failed to fetch/parse anomaly: {e}")
            return

        root_cause = analysis.get("root_cause", "Unknown issue")
        files = analysis.get("relevant_files", [])
        
        self.logger.info(f"Proposing fix for: {root_cause[:50]}...")
        
        # PROMPT CONSTRUCTION
        prompt = f"""
        You are a Senior Software Engineer.
        The following issue has been analyzed:
        "{root_cause}"
        
        Your task is to fix this issue in the codebase.
        Relevant files identified: {', '.join(files)}
        
        Please provide a UNIFIED DIFF patch to fix the issue.
        """
        
        # We need to run this in the context of the REPO.
        repo_path = os.getenv("REPO_PATH", "/Users/apple/Development/projects/the-night-agent")
        
        self.logger.info(f"Running cline in {repo_path}...")
        
        try:
            # Run Cline non-interactively
            cmd = ["npx", "cline", prompt, "--no-interactive"]
            
            # Since we can't easily capture the 'diff' from cline's interactive output unless it writes to a file,
            # we instruct it to write to a file.
            
            patch_file = os.path.join(repo_path, f"fix_{anomaly_id}.patch")
            
            prompt_with_file = f"{prompt}\n\nIMPORTANT: Write the STANDARD UNIFIED DIFF (starting with 'diff --git') to a file named 'fix_{anomaly_id}.patch' in the current directory. Do not wrap in markdown blocks inside the file."
            
            cmd = ["npx", "cline", prompt_with_file, "--no-interactive"]
            subprocess.run(cmd, cwd=repo_path, capture_output=True, text=True, timeout=300)
            
            if os.path.exists(patch_file):
                with open(patch_file, "r") as f:
                    patch_content = f.read()
                
                # Cleanup
                os.remove(patch_file)
                
                encoded_patch = base64.b64encode(patch_content.encode('utf-8')).decode('utf-8')
                print(f"PATCH_OUTPUT:{encoded_patch}")
                
                # Also save directly via API here to be robust?
                # Kestra flow handles it via stdout parsing usually but moving logic here is safer.
                self.submit_proposal(anomaly_id, analysis, patch_content)
                
            else:
                self.logger.error("No patch file found.")
                print("PATCH_OUTPUT:") # Empty
                
        except Exception as e:
            self.logger.error(f"Cline execution failed: {e}")

    def submit_proposal(self, anomaly_id, analysis, patch):
        try:
            res = requests.post(f"{self.api_url}/anomalies/proposal", json={
                'id': anomaly_id,
                'analysis': json.dumps(analysis),
                'patch': patch,
                'status': 'PROPOSAL_READY'
            })
            if res.ok:
                self.logger.info("Proposal submitted successfully.")
            else:
                self.logger.error(f"Failed to submit proposal: {res.text}")
        except Exception as e:
            self.logger.error(f"Failed to submit proposal: {e}")

if __name__ == "__main__":
    import sys
    # Expect Anomaly ID as arg
    if len(sys.argv) > 1:
        anomaly_id = sys.argv[1]
        ProposeFixAgent().run(anomaly_id)
    else:
        print("Error: Anomaly ID required")
