import re
from typing import List, Dict, Optional

class ShadowAPIDetector:
    def __init__(self, known_apis: Optional[List[str]] = None):
        self.known_apis = set(known_apis if known_apis else [])
        self.url_pattern = re.compile(
            r'(?:fetch|axios|request|http\.get|http\.post|urllib)\s*\(\s*["\']([^"\']+)["\']|'
            r'["\'](https?://[^"\']+)["\']'
        )
        self.secrets_pattern = re.compile(
            r'(?:api_key|apikey|secret|password|token)\s*[=:]\s*["\']([a-zA-Z0-9_\-]{16,})["\']',
            re.IGNORECASE
        )

    def scan_code(self, code_content: str) -> List[Dict]:
        results = []
        
        found_urls = self.url_pattern.findall(code_content)
        for url_group in found_urls:
            url = url_group[0] or url_group[1]
            if url and "localhost" not in url and "127.0.0.1" not in url:
                path = url.split('/')[-1] if '/' in url else url
                if path not in self.known_apis:
                    results.append({
                        "type": "shadow_api",
                        "url": url,
                        "risk": "Medium",
                        "reason": "Undocumented endpoint usage"
                    })
        
        secrets = self.secrets_pattern.findall(code_content)
        for key_name, secret_value in secrets:
            results.append({
                "type": "hardcoded_secret",
                "key": key_name,
                "risk": "High",
                "reason": "Hardcoded secret detected - use environment variables"
            })
        
        return results

    def scan_file(self, file_path: str) -> List[Dict]:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return self.scan_code(content)
        except Exception as e:
            return [{"error": str(e)}]

def create_default_detector() -> ShadowAPIDetector:
    known_apis = [
        "api/v1/users", "api/v1/auth", "api/v1/projects", 
        "api/v1/analytics", "api/v1/health", "api/v1/leaderboard"
    ]
    return ShadowAPIDetector(known_apis)