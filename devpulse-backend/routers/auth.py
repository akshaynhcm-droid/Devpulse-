from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from datetime import timedelta
from typing import Optional
import secrets

from database import get_db, User as DBUser
from auth import verify_password, get_password_hash, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES, get_current_user as get_current_user_auth

router = APIRouter()

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    plan: str = "free"
    is_admin: bool = False
    api_key: Optional[str] = None

class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

@router.post("/register", response_model=UserResponse)
def register(user_data: RegisterRequest, db: Session = Depends(get_db)):
    email = user_data.email
    password = user_data.password

    db_user = db.query(DBUser).filter(DBUser.email == email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = DBUser(
        email=email,
        hashed_password=get_password_hash(password),
        api_key="dp_" + secrets.token_urlsafe(16),
        is_admin=False,
        plan="free"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return UserResponse(
        id=new_user.id,
        email=new_user.email,
        plan=new_user.plan or "free",
        is_admin=new_user.is_admin or False,
        api_key=new_user.api_key
    )

@router.post("/login", response_model=LoginResponse)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: Session = Depends(get_db)
):
    user = db.query(DBUser).filter(DBUser.email == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password or ""):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, 
        expires_delta=access_token_expires
    )
    
    return LoginResponse(
        access_token=access_token, 
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            email=user.email,
            plan=user.plan or "free",
            is_admin=user.is_admin or False,
            api_key=user.api_key
        )
    )

@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: DBUser = Depends(get_current_user_auth)):
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        plan=current_user.plan or "free",
        is_admin=current_user.is_admin or False,
        api_key=current_user.api_key
    )

@router.post("/refresh")
def refresh_token(current_user: DBUser = Depends(get_current_user_auth)):
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": current_user.email},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/logout")
def logout():
    return {"message": "Successfully logged out"}