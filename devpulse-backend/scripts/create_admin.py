import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db_session, User

def make_admin(email: str):
    with get_db_session() as db:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.is_admin = True
            db.commit()
            print(f"Success: User {email} is now an ADMIN.")
            return True
        else:
            print(f"Error: User {email} not found.")
            return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python create_admin.py <user_email>")
    else:
        make_admin(sys.argv[1])