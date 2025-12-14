
import sys
import logging
import os
import subprocess
import requests

class MergeFixAgent:
    def __init__(self):
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger("MergeFixAgent")
        self.api_url = os.getenv("API_URL", "http://localhost:3001/api/internal")

    def run(self, fix_id, repo_path, branch_name):
        self.logger.info(f"Merging fix {fix_id} from {branch_name} into main at {repo_path}")

        try:
            # 1. Checkout Main
            subprocess.run(["git", "checkout", "main"], cwd=repo_path, check=True)
            subprocess.run(["git", "pull", "origin", "main"], cwd=repo_path, check=True)

            # 2. Merge
            self.logger.info(f"Merging {branch_name}...")
            # --no-ff preserves history of the feature branch
            subprocess.run(["git", "merge", "--no-ff", branch_name], cwd=repo_path, check=True)

            # 3. Push
            self.logger.info("Pushing main...")
            # subprocess.run(["git", "push", "origin", "main"], cwd=repo_path, check=True) # Uncomment for real push
            self.logger.info("(Push skipped for safety in demo mode, uncomment in agent to enable)")

            # 4. Cleanup (Optional)
            # subprocess.run(["git", "branch", "-d", branch_name], cwd=repo_path)

            self.logger.info("Merge successful.")
            
        except subprocess.CalledProcessError as e:
            self.logger.error(f"Merge failed: {e}")
            sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python merge_fix_agent.py <fix_id> <repo_path> <branch>")
        sys.exit(1)
    # Args from LocalWorkflowEngine: [fixId, repoPath, branch]
    # sys.argv[0] is script name
    MergeFixAgent().run(sys.argv[1], sys.argv[2], sys.argv[3])
