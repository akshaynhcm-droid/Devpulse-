import pytest
import os
import sys

os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from database import init_db, get_db_session, User
from auth import get_password_hash, create_access_token

# Import app after env is set
from main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    init_db()
    yield


@pytest.fixture
def auth_headers():
    """Create a test user and return auth headers."""
    with get_db_session() as db:
        existing = db.query(User).filter(User.email == "test@example.com").first()
        if not existing:
            user = User(
                email="test@example.com",
                hashed_password=get_password_hash("testpassword123"),
                api_key="dp_testkey123",
                is_admin=False,
                plan="free",
            )
            db.add(user)
            db.commit()

    token = create_access_token(data={"sub": "test@example.com"})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers():
    """Create an admin user and return auth headers."""
    with get_db_session() as db:
        existing = db.query(User).filter(User.email == "admin@example.com").first()
        if not existing:
            user = User(
                email="admin@example.com",
                hashed_password=get_password_hash("adminpassword123"),
                api_key="dp_adminkey123",
                is_admin=True,
                plan="pro",
            )
            db.add(user)
            db.commit()

    token = create_access_token(data={"sub": "admin@example.com"})
    return {"Authorization": f"Bearer {token}"}


class TestRootEndpoints:
    def test_root(self):
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "online"
        assert data["service"] == "DevPulse Core API"

    def test_health(self):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


class TestAuthEndpoints:
    def test_register(self):
        response = client.post(
            "/api/auth/register",
            json={"email": "newuser@example.com", "password": "securepass123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "newuser@example.com"
        assert data["plan"] == "free"

    def test_register_duplicate_email(self):
        client.post(
            "/api/auth/register",
            json={"email": "duplicate@example.com", "password": "pass123"},
        )
        response = client.post(
            "/api/auth/register",
            json={"email": "duplicate@example.com", "password": "pass456"},
        )
        assert response.status_code == 400

    def test_login(self):
        client.post(
            "/api/auth/register",
            json={"email": "loginuser@example.com", "password": "mypassword"},
        )
        response = client.post(
            "/api/auth/login",
            data={"username": "loginuser@example.com", "password": "mypassword"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self):
        client.post(
            "/api/auth/register",
            json={"email": "wrongpw@example.com", "password": "correct"},
        )
        response = client.post(
            "/api/auth/login",
            data={"username": "wrongpw@example.com", "password": "incorrect"},
        )
        assert response.status_code == 401

    def test_get_me(self, auth_headers):
        response = client.get("/api/auth/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "test@example.com"

    def test_unauthorized_access(self):
        response = client.get("/api/auth/me")
        assert response.status_code == 401


class TestAgentEndpoints:
    def test_agent_interact(self, auth_headers):
        response = client.post(
            "/api/agent/interact",
            json={
                "agent_id": "test-agent-1",
                "model": "gpt-4",
                "prompt_tokens": 100,
                "completion_tokens": 50,
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "cost" in data
        assert "anomaly_detected" in data


class TestSecurityScan:
    def test_security_scan(self):
        response = client.post(
            "/api/security/scan",
            json={"code": 'api_key = "sk-1234567890abcdef"'},
        )
        assert response.status_code == 200
        data = response.json()
        assert "findings" in data
        assert data["count"] >= 0


class TestAnalytics:
    def test_analytics_summary(self):
        response = client.get("/api/analytics/summary")
        assert response.status_code == 200
        data = response.json()
        assert "total_cost" in data
        assert "recent_calls" in data
        assert "security_events" in data


class TestAdminEndpoints:
    def test_admin_stats_requires_admin(self, auth_headers):
        response = client.get("/api/admin/stats", headers=auth_headers)
        assert response.status_code == 403

    def test_admin_stats(self, admin_headers):
        response = client.get("/api/admin/stats", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total_users" in data
        assert "total_cost_processed" in data

    def test_admin_health(self, admin_headers):
        response = client.get("/api/admin/health", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "websocket_connections" in data
