import pytest
from services.shadow_api_detector import ShadowAPIDetector

def test_detect_api_key():
    detector = ShadowAPIDetector()
    code = 'api_key = "sk-1234567890abcdefgh"'
    results = detector.scan_code(code)
    assert len(results) == 1
    assert results[0]["type"] == "hardcoded_secret"

def test_detect_secret():
    detector = ShadowAPIDetector()
    code = 'secret = "my-super-secret-key-12345"'
    results = detector.scan_code(code)
    assert len(results) == 1
    assert results[0]["type"] == "hardcoded_secret"

def test_detect_shadow_api():
    detector = ShadowAPIDetector(known_apis=["api/v1/users"])
    code = 'fetch("https://api.example.com/unknown-endpoint")'
    results = detector.scan_code(code)
    assert len(results) == 1
    assert results[0]["type"] == "shadow_api"

def test_known_api_not_flagged():
    detector = ShadowAPIDetector(known_apis=["api/v1/users"])
    code = 'fetch("/api/v1/users")'
    results = detector.scan_code(code)
    assert len(results) == 0

def test_localhost_not_flagged():
    detector = ShadowAPIDetector()
    code = 'fetch("http://localhost:3000/api")'
    results = detector.scan_code(code)
    assert len(results) == 0