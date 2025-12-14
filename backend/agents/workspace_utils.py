import os

class WorkspaceManager:
    def __init__(self, base_workspace_path=None):
        if base_workspace_path:
             self.base_path = base_workspace_path
        else:
            # Default to backend/workspace/repos relative to this file
            # agents/workspace_utils.py -> agents/../workspace/repos
            current_dir = os.path.dirname(os.path.abspath(__file__))
            self.base_path = os.path.abspath(os.path.join(current_dir, '..', 'workspace', 'repos'))
        
        if not os.path.exists(self.base_path):
            os.makedirs(self.base_path, exist_ok=True)

    def get_repo_path(self, repo_url):
        """
        Derives a local path from a git URL.
        e.g. git@github.com:omkarChend1kar/vr_trainer.git -> .../workspace/repos/omkarChend1kar/vr_trainer
        """
        if not repo_url:
            return None
            
        # Strip protocols
        clean_url = repo_url.replace("https://", "").replace("http://", "").replace("git@", "").replace("ssh://", "")
        if clean_url.endswith(".git"):
            clean_url = clean_url[:-4]
            
        # clean_url is now likely github.com:user/repo or github.com/user/repo
        clean_url = clean_url.replace(":", "/")
        
        # Split parts
        parts = clean_url.split("/")
        # We want the last two usually: user/repo
        if len(parts) >= 2:
            repo_name_path = os.path.join(parts[-2], parts[-1])
        else:
            repo_name_path = parts[-1]
            
        return os.path.join(self.base_path, repo_name_path)

    def ensure_path(self, path):
        if not os.path.exists(path):
            os.makedirs(path, exist_ok=True)
