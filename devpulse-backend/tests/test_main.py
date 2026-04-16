import pytest
from fastapi.testclient import TestClient
from main import app, get_db
from database import init_db

client = TestClient(app)

@pytest.fixture(scope="module")
def setup_db():
    init_db()
    yield

# ============================================================================
# AUTH TESTS
# ============================================================================

def test_register_user(setup_db):
    response = client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": "testpassword123",
        "name": "Test User"
    })
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["email"] == "test@example.com"

def test_login_user(setup_db):
    # First register
    client.post("/api/auth/register", json={
        "email": "login@test.com",
        "password": "testpass123",
        "name": "Login Test"
    })
    # Then login
    response = client.post("/api/auth/login", data={
        "username": "login@test.com",
        "password": "testpass123"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "token_type" in data

def test_login_invalid_credentials(setup_db):
    response = client.post("/api/auth/login", data={
        "username": "nonexistent@test.com",
        "password": "wrongpassword"
    })
    assert response.status_code == 401

# ============================================================================
# COLLECTIONS TESTS
# ============================================================================

def test_create_collection(setup_db):
    # Register and login first
    client.post("/api/auth/register", json={
        "email": "collections@test.com",
        "password": "testpass123",
        "name": "Collections Test"
    })
    login = client.post("/api/auth/login", data={
        "username": "collections@test.com",
        "password": "testpass123"
    })
    token = login.json()["access_token"]
    
    response = client.post("/api/collections/", 
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Test Collection",
            "description": "Test Description",
            "format": "postman",
            "data": '{"info": {"name": "Test"}}'
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Collection"

def test_list_collections(setup_db):
    # Register and login first
    client.post("/api/auth/register", json={
        "email": "list@test.com",
        "password": "testpass123",
        "name": "List Test"
    })
    login = client.post("/api/auth/login", data={
        "username": "list@test.com",
        "password": "testpass123"
    })
    token = login.json()["access_token"]
    
    response = client.get("/api/collections/", 
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "collections" in data

# ============================================================================
# SCANNING TESTS
# ============================================================================

def test_run_scan(setup_db):
    # Register, login, create collection
    client.post("/api/auth/register", json={
        "email": "scan@test.com",
        "password": "testpass123",
        "name": "Scan Test"
    })
    login = client.post("/api/auth/login", data={
        "username": "scan@test.com",
        "password": "testpass123"
    })
    token = login.json()["access_token"]
    
    # Create collection
    col = client.post("/api/collections/", 
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Scan Test Collection",
            "format": "postman",
            "data": '{"item": [{"request": {"method": "POST", "url": "http://example.com/api/users", "header": []}}]}'
        }
    )
    collection_id = col.json()["id"]
    
    # Run scan
    response = client.post("/api/scanning/run",
        headers={"Authorization": f"Bearer {token}"},
        json={"collection_id": collection_id}
    )
    assert response.status_code == 200
    data = response.json()
    assert "scan_id" in data
    assert data["status"] == "completed"

# ============================================================================
# SHADOW APIS TESTS
# ============================================================================

def test_scan_shadow_apis(setup_db):
    # Register, login, create collection
    client.post("/api/auth/register", json={
        "email": "shadow@test.com",
        "password": "testpass123",
        "name": "Shadow Test"
    })
    login = client.post("/api/auth/login", data={
        "username": "shadow@test.com",
        "password": "testpass123"
    })
    token = login.json()["access_token"]
    
    # Create collection with unknown endpoint
    col = client.post("/api/collections/", 
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Shadow Test Collection",
            "format": "postman",
            "data": '{"item": [{"request": {"method": "GET", "url": "https://api.example.com/unknown-endpoint", "header": []}}]}'
        }
    )
    collection_id = col.json()["id"]
    
    # Scan for shadow APIs
    response = client.post("/api/shadow-apis/scan",
        headers={"Authorization": f"Bearer {token}"},
        json={"collection_id": collection_id}
    )
    assert response.status_code == 200
    data = response.json()
    assert "shadow_apis" in data

# ============================================================================
# TOKEN ANALYTICS TESTS
# ============================================================================

def test_record_token_usage(setup_db):
    # Register and login
    client.post("/api/auth/register", json={
        "email": "tokens@test.com",
        "password": "testpass123",
        "name": "Tokens Test"
    })
    login = client.post("/api/auth/login", data={
        "username": "tokens@test.com",
        "password": "testpass123"
    })
    token = login.json()["access_token"]
    
    response = client.post("/api/token-analytics/record",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "model": "gpt-4",
            "prompt_tokens": 100,
            "completion_tokens": 50,
            "cost_usd": 0.005
        }
    )
    assert response.status_code == 200

# ============================================================================
# KILL SWITCH TESTS
# ============================================================================

def test_set_budget(setup_db):
    # Register and login
    client.post("/api/auth/register", json={
        "email": "budget@test.com",
        "password": "testpass123",
        "name": "Budget Test"
    })
    login = client.post("/api/auth/login", data={
        "username": "budget@test.com",
        "password": "testpass123"
    })
    token = login.json()["access_token"]
    
    response = client.post("/api/kill-switch/budget",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "monthly_limit": 1000.0,
            "daily_limit": 50.0,
            "alert_threshold_pct": 80.0
        }
    )
    assert response.status_code == 200

def test_trigger_and_reset_kill_switch(setup_db):
    # Register and login
    client.post("/api/auth/register", json={
        "email": "killswitch@test.com",
        "password": "testpass123",
        "name": "Kill Switch Test"
    })
    login = client.post("/api/auth/login", data={
        "username": "killswitch@test.com",
        "password": "testpass123"
    })
    token = login.json()["access_token"]
    
    # Trigger
    trigger = client.post("/api/kill-switch/trigger",
        headers={"Authorization": f"Bearer {token}"},
        json={"reason": "Test trigger"}
    )
    assert trigger.status_code == 200
    assert trigger.json()["is_active"] == True
    
    # Reset
    reset = client.post("/api/kill-switch/reset",
        headers={"Authorization": f"Bearer {token}"},
        json={"reason": "Test reset"}
    )
    assert reset.status_code == 200
    assert reset.json()["is_active"] == False

# ============================================================================
# COMPLIANCE TESTS
# ============================================================================

def test_generate_compliance_report(setup_db):
    # Register and login
    client.post("/api/auth/register", json={
        "email": "compliance@test.com",
        "password": "testpass123",
        "name": "Compliance Test"
    })
    login = client.post("/api/auth/login", data={
        "username": "compliance@test.com",
        "password": "testpass123"
    })
    token = login.json()["access_token"]
    
    response = client.post("/api/compliance/generate",
        headers={"Authorization": f"Bearer {token}"},
        json={"framework": "pci_dss"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["framework"] == "pci_dss"

# ============================================================================
# TEAM TESTS
# ============================================================================

def test_invite_team_member(setup_db):
    # Register and login
    client.post("/api/auth/register", json={
        "email": "teamlead@test.com",
        "password": "testpass123",
        "name": "Team Lead"
    })
    login = client.post("/api/auth/login", data={
        "username": "teamlead@test.com",
        "password": "testpass123"
    })
    token = login.json()["access_token"]
    
    response = client.post("/api/team/invite",
        headers={"Authorization": f"Bearer {token}"},
        json={"email": "teammember@test.com", "role": "viewer"}
    )
    assert response.status_code == 200
    assert response.json()["email"] == "teammember@test.com"

# ============================================================================
# ONBOARDING TESTS
# ============================================================================

def test_onboarding_progress(setup_db):
    # Register and login
    client.post("/api/auth/register", json={
        "email": "onboarding@test.com",
        "password": "testpass123",
        "name": "Onboarding Test"
    })
    login = client.post("/api/auth/login", data={
        "username": "onboarding@test.com",
        "password": "testpass123"
    })
    token = login.json()["access_token"]
    
    # Get progress
    response = client.get("/api/onboarding/progress",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "import_collection" in data
    
    # Complete a step
    complete = client.post("/api/onboarding/complete",
        headers={"Authorization": f"Bearer {token}"},
        json={"step": "import_collection"}
    )
    assert complete.status_code == 200
    assert complete.json()["import_collection"] == True

# ============================================================================
# DASHBOARD TESTS
# ============================================================================

def test_dashboard_stats(setup_db):
    # Register and login
    client.post("/api/auth/register", json={
        "email": "dashboard@test.com",
        "password": "testpass123",
        "name": "Dashboard Test"
    })
    login = client.post("/api/auth/login", data={
        "username": "dashboard@test.com",
        "password": "testpass123"
    })
    token = login.json()["access_token"]
    
    response = client.get("/api/dashboard/stats",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "total_collections" in data
    assert "total_findings" in data

# ============================================================================
# WEBHOOK TESTS
# ============================================================================

def test_github_webhook_push(setup_db):
    payload = {
        "repository": {"full_name": "test/repo", "name": "repo"},
        "ref": "refs/heads/main",
        "commits": [{"id": "abc123", "message": "Test commit"}]
    }
    response = client.post("/api/webhook/github", json=payload)
    assert response.status_code == 200

def test_slack_test_alert(setup_db):
    response = client.post("/api/alerts/test")
    assert response.status_code == 200
    assert response.json()["status"] == "sent"
