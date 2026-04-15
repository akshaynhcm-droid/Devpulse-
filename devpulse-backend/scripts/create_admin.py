import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal, User

def make_admin(email: str):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.is_admin = True
            db.commit()
            print(f"Success: User {email} is now an ADMIN.")
            return True
        else:
            print(f"Error: User {email} not found.")
            return False
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python create_admin.py <user_email>")
    else:
        make_admin(sys.argv[1])