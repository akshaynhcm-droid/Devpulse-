import pytest
import os
import sys

# Ensure SECRET_KEY is set before importing auth
os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    decode_token,
    generate_api_key,
)


class TestPasswordHashing:
    def test_hash_and_verify(self):
        password = "SecureP@ss123"
        hashed = get_password_hash(password)
        assert verify_password(password, hashed) is True

    def test_wrong_password_fails(self):
        hashed = get_password_hash("correct-password")
        assert verify_password("wrong-password", hashed) is False

    def test_hash_is_different_from_plain(self):
        password = "my-password"
        hashed = get_password_hash(password)
        assert hashed != password

    def test_different_hashes_for_same_password(self):
        password = "same-password"
        h1 = get_password_hash(password)
        h2 = get_password_hash(password)
        assert h1 != h2  # bcrypt uses random salt


class TestJWT:
    def test_create_and_decode_token(self):
        token = create_access_token(data={"sub": "user@example.com"})
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "user@example.com"

    def test_expired_token(self):
        from datetime import timedelta
        token = create_access_token(
            data={"sub": "user@example.com"},
            expires_delta=timedelta(seconds=-1)
        )
        # Token should be expired but decode may still work depending on timing
        # The key thing is it doesn't crash
        result = decode_token(token)
        # Expired tokens return None
        assert result is None

    def test_invalid_token(self):
        result = decode_token("invalid-token-string")
        assert result is None

    def test_token_contains_expiry(self):
        token = create_access_token(data={"sub": "user@example.com"})
        payload = decode_token(token)
        assert "exp" in payload

    def test_custom_expiry(self):
        from datetime import timedelta
        token = create_access_token(
            data={"sub": "user@example.com"},
            expires_delta=timedelta(minutes=60)
        )
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "user@example.com"


class TestAPIKey:
    def test_generate_api_key_format(self):
        key = generate_api_key()
        assert key.startswith("dp_")
        assert len(key) > 10

    def test_api_keys_are_unique(self):
        keys = [generate_api_key() for _ in range(10)]
        assert len(set(keys)) == 10


class TestSecretKeyEnforcement:
    def test_missing_secret_key_raises(self):
        original = os.environ.pop("SECRET_KEY", None)
        try:
            # Re-import should fail
            with pytest.raises(RuntimeError, match="SECRET_KEY"):
                import importlib
                import auth as auth_mod
                importlib.reload(auth_mod)
        finally:
            if original:
                os.environ["SECRET_KEY"] = original
            else:
                os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"
