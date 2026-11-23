from datetime import datetime, timedelta
from typing import Optional
import os
import base64
import hashlib
import hmac
import json
import secrets
import resend
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from resend.exceptions import ResendError
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Float, create_engine, and_
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from pydantic import BaseModel, Field

# --- API KEYS CONFIGURATION ---
RESEND_API_KEY = os.getenv("RESEND_API_KEY")
EMAIL_FROM = os.getenv("EMAIL_FROM", "Pinned! Management <onboarding@resend.dev>")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# --- DATABASE SETUP ---
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./pinned.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

database_options = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    database_options["connect_args"] = {"check_same_thread": False}
engine = create_engine(DATABASE_URL, **database_options)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- DATABASE MODELS ---
class Service(Base):
    __tablename__ = "services"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String)
    price = Column(Float)
    duration_minutes = Column(Integer)

class Appointment(Base):
    __tablename__ = "appointments"
    id = Column(Integer, primary_key=True, index=True)
    service_id = Column(Integer, ForeignKey("services.id"))
    client_name = Column(String)
    client_email = Column(String)
    client_phone = Column(String)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    payment_method = Column(String, default="Bank Transfer")
    bank_name = Column(String, nullable=True)
    account_type = Column(String, nullable=True)
    account_number = Column(String, nullable=True)
    client_account_holder = Column(String, nullable=True)
    reminder_sent = Column(Boolean, default=False)

class ClientAccount(Base):
    __tablename__ = "client_accounts"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password = Column(String)
    pin = Column(String)
    penalty_balance = Column(Float, default=0.0)
    is_verified = Column(Boolean, default=True)

class OwnerSettings(Base):
    __tablename__ = "owner_settings"
    id = Column(Integer, primary_key=True, index=True)
    bank_name = Column(String, default="")
    account_type = Column(String, default="")
    account_number = Column(String, default="")
    account_holder = Column(String, default="")

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Pinned! API")
token_bearer = HTTPBearer(auto_error=False)
TOKEN_TTL = timedelta(hours=8)
PASSWORD_HASH_ITERATIONS = 600_000

# --- CORS MIDDLEWARE ---
allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}

def appointment_response(appointment: Appointment, include_contact: bool = False) -> dict:
    response = {
        "id": appointment.id,
        "service_id": appointment.service_id,
        "start_time": appointment.start_time,
        "end_time": appointment.end_time,
        "payment_method": appointment.payment_method,
    }
    if include_contact:
        response.update({
            "client_name": appointment.client_name,
            "client_email": appointment.client_email,
            "client_phone": appointment.client_phone,
        })
    return response

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def hash_secret(secret: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", secret.encode("utf-8"), bytes.fromhex(salt), PASSWORD_HASH_ITERATIONS
    ).hex()
    return f"pbkdf2_sha256${PASSWORD_HASH_ITERATIONS}${salt}${digest}"

def verify_secret(secret: str, stored_hash: Optional[str]) -> bool:
    if not stored_hash:
        return False
    try:
        algorithm, iterations, salt, expected_digest = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual_digest = hashlib.pbkdf2_hmac(
            "sha256", secret.encode("utf-8"), bytes.fromhex(salt), int(iterations)
        ).hex()
        return hmac.compare_digest(actual_digest, expected_digest)
    except (ValueError, TypeError):
        return False

def verify_client_secret(secret: str, stored_secret: Optional[str]) -> bool:
    if stored_secret and stored_secret.startswith("pbkdf2_sha256$"):
        return verify_secret(secret, stored_secret)
    return bool(stored_secret) and hmac.compare_digest(
        secret.encode("utf-8"), stored_secret.encode("utf-8")
    )

def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")

def client_auth_version(client: ClientAccount) -> str:
    return hashlib.sha256(f"{client.password}:{client.pin}".encode("utf-8")).hexdigest()

def issue_token(
    subject: str,
    role: str,
    purpose: str = "access",
    auth_version: Optional[str] = None,
) -> str:
    secret = os.getenv("AUTH_TOKEN_SECRET")
    if not secret:
        raise HTTPException(status_code=503, detail="Authentication is not configured.")
    payload = {
        "sub": subject,
        "role": role,
        "purpose": purpose,
        "exp": int((datetime.utcnow() + TOKEN_TTL).timestamp()),
    }
    if auth_version:
        payload["auth_version"] = auth_version
    encoded_payload = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(secret.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256).digest()
    return f"{encoded_payload}.{_b64url_encode(signature)}"

def decode_token(credentials: HTTPAuthorizationCredentials) -> dict:
    secret = os.getenv("AUTH_TOKEN_SECRET")
    if not secret or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        encoded_payload, encoded_signature = credentials.credentials.split(".", 1)
        signature = base64.urlsafe_b64decode(encoded_signature + "=" * (-len(encoded_signature) % 4))
        expected_signature = hmac.new(secret.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected_signature):
            raise ValueError("Invalid signature")
        payload_bytes = base64.urlsafe_b64decode(encoded_payload + "=" * (-len(encoded_payload) % 4))
        payload = json.loads(payload_bytes)
        if payload["exp"] <= int(datetime.utcnow().timestamp()):
            raise ValueError("Expired token")
        return payload
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

def get_token_claims(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(token_bearer),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return decode_token(credentials)

def get_optional_token_claims(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(token_bearer),
) -> Optional[dict]:
    return decode_token(credentials) if credentials else None

def require_admin(claims: dict = Depends(get_token_claims)) -> dict:
    if claims.get("role") != "admin" or claims.get("purpose") != "access":
        raise HTTPException(status_code=403, detail="Administrator access required.")
    return claims

def require_client(claims: dict = Depends(get_token_claims), db: Session = Depends(get_db)) -> dict:
    if claims.get("role") != "client" or claims.get("purpose") != "access":
        raise HTTPException(status_code=403, detail="Client access required.")
    client = db.query(ClientAccount).filter(ClientAccount.email.ilike(claims["sub"])).first()
    if not client or not hmac.compare_digest(claims.get("auth_version", ""), client_auth_version(client)):
        raise HTTPException(status_code=401, detail="Client session has expired.")
    return claims

def require_password_reset(claims: dict = Depends(get_token_claims), db: Session = Depends(get_db)) -> dict:
    if claims.get("role") != "client" or claims.get("purpose") != "password_reset":
        raise HTTPException(status_code=403, detail="Password reset verification required.")
    client = db.query(ClientAccount).filter(ClientAccount.email.ilike(claims["sub"])).first()
    if not client or not hmac.compare_digest(claims.get("auth_version", ""), client_auth_version(client)):
        raise HTTPException(status_code=401, detail="Password reset session has expired.")
    return claims

# --- PYDANTIC SCHEMAS ---
class AppointmentCreate(BaseModel):
    service_id: int
    client_name: str
    client_email: str
    client_phone: str
    start_time: datetime
    end_time: datetime
    payment_method: str
    bank_name: Optional[str] = None
    account_type: Optional[str] = None
    account_number: Optional[str] = None
    client_account_holder: Optional[str] = None

class AppointmentUpdate(BaseModel):
    service_id: Optional[int] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    payment_method: Optional[str] = None

class ClientRegister(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    pin: str

class ClientLogin(BaseModel):
    email: str
    password: str
    pin: str

class ClientPasswordResetRequest(BaseModel):
    email: str
    password: str

class ClientPasswordReset(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)
    new_pin: str

class AdminLogin(BaseModel):
    email: str
    password: str
    pin: str

class OwnerSettingsUpdate(BaseModel):
    bank_name: str
    account_type: str
    account_number: str
    account_holder: str

# --- NOTIFICATION HELPERS ---
def send_transactional_email(recipient: str, subject: str, html: str) -> str:
    if not RESEND_API_KEY:
        return "not_configured"

    try:
        resend.Emails.send({
            "from": EMAIL_FROM,
            "to": [recipient],
            "subject": subject,
            "html": html,
        })
    except Exception as e:
        print(f"[EMAIL ERROR]: {e}")
        return "failed"

    return "accepted"

def send_booking_notifications(client_name: str, client_email: str, client_phone: str, service_name: str, start_time: datetime, booking_id: int, payment_method: str, total_paid: float, owner_bank: dict) -> str:
    formatted_time = start_time.strftime("%d/%m/%Y at %H:%M")
    bank_instructions = ""
    if payment_method == "Bank Transfer":
        account_number = owner_bank.get("account_number", "")
        account_holder = owner_bank.get("account_holder", "")
        bank_instructions = f"""
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin-top: 15px;">
                <p style="margin: 0; font-weight: bold; color: #1e293b;">EFT Payout Instructions:</p>
                <p style="margin: 5px 0 0 0; color: #475569;">Please transfer <strong>R{total_paid:.2f}</strong> to:</p>
                <p style="margin: 5px 0 0 0; color: #0f172a;"><strong>Bank:</strong> {owner_bank.get('bank_name', '')}<br><strong>Account Type:</strong> {owner_bank.get('account_type', '')}<br><strong>Account Number:</strong> {account_number}<br><strong>Holder:</strong> {account_holder}<br><strong>Reference:</strong> Booking #{booking_id}</p>
            </div>
        """ if account_number and account_holder else """
            <p>Please contact the business to arrange payment details. Reference: Booking #{booking_id}.</p>
        """

    return send_transactional_email(
        client_email,
        f"Booking Confirmation #{booking_id} - {service_name}",
        f"""
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 12px;">
                <h2 style="color: #4f46e5;">Booking Confirmed!</h2>
                <p>Dear <strong>{client_name}</strong>,</p>
                <p>Your appointment for <strong>{service_name}</strong> on <strong>{formatted_time}</strong> has been successfully booked.</p>
                <p><strong>Total Amount Due:</strong> R{total_paid:.2f} (Paid via {payment_method})</p>
                {bank_instructions}
                <p style="margin-top: 30px;">Warm regards,<br><strong>The Pinned! Team</strong></p>
            </div>
        """,
    )

def send_owner_cancellation_notification(client_name: str, client_email: str, service_name: str, start_time: datetime, payment_method: str, is_late_cancellation: bool) -> str:
    formatted_time = start_time.strftime("%d/%m/%Y at %H:%M")
    if payment_method == "Bank Transfer":
        refund_notice = "Eligible for a 50% refund (cancelled within 24 hours)." if is_late_cancellation else "Eligible for a full (100%) refund (cancelled more than 24 hours in advance)."
    else:
        refund_notice = "Account flagged with a 50% cancellation penalty applied to next booking (cancelled within 24 hours)." if is_late_cancellation else "Cancelled early with no penalty fee."

    return send_transactional_email(
        client_email,
        f"Appointment Cancellation & Refund Terms for {service_name}",
        f"""
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 12px;">
                <h2 style="color: #e11d48;">Appointment Cancellation Notice</h2>
                <p>Dear <strong>{client_name}</strong>,</p>
                <p>Your appointment for <strong>{service_name}</strong> scheduled for <strong>{formatted_time}</strong> has been cancelled.</p>
                <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <p style="margin: 0; font-weight: bold; color: #1e293b;">Cancellation Policy Terms ({payment_method}):</p>
                    <p style="margin: 5px 0 0 0; color: #475569;">{refund_notice}</p>
                </div>
                <p style="margin-top: 30px;">Warm regards,<br><strong>The Pinned! Team</strong></p>
            </div>
        """,
    )

# --- STARTUP EVENT ---
@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    try:
        for client in db.query(ClientAccount).all():
            if not client.password.startswith("pbkdf2_sha256$"):
                client.password = hash_secret(client.password)
            if not client.pin.startswith("pbkdf2_sha256$"):
                client.pin = hash_secret(client.pin)
        db.commit()

        if db.query(Service).count() == 0:
            default_services = [
                Service(name="Strategy Consultation", description="Placeholder: discuss goals, priorities, and a proposed project roadmap.", price=850.0, duration_minutes=30),
                Service(name="Code Review Session", description="Placeholder: review a codebase, architecture, risks, and next steps.", price=2000.0, duration_minutes=60),
                Service(name="UI/UX Design Session", description="Placeholder: review layouts, visual direction, accessibility, and user experience.", price=1300.0, duration_minutes=45),
                Service(name="Development Consultation", description="Placeholder: technical discovery for a website or application project.", price=950.0, duration_minutes=45)
            ]
            db.add_all(default_services)
            db.commit()
        if db.query(OwnerSettings).count() == 0:
            db.add(OwnerSettings(bank_name="", account_type="", account_number="", account_holder=""))
            db.commit()
    except Exception as e:
        print(f"Error seeding data: {e}")
        raise
    finally:
        db.close()

# --- OWNER SETTINGS ENDPOINTS ---
@app.post("/admin/login")
def admin_login(data: AdminLogin):
    admin_email = os.getenv("ADMIN_EMAIL", "").strip().lower()
    password_hash = os.getenv("ADMIN_PASSWORD_HASH")
    pin_hash = os.getenv("ADMIN_PIN_HASH")
    if not all((os.getenv("AUTH_TOKEN_SECRET"), admin_email, password_hash, pin_hash)):
        raise HTTPException(status_code=503, detail="Authentication is not configured.")
    if (
        not hmac.compare_digest(data.email.strip().lower().encode("utf-8"), admin_email.encode("utf-8"))
        or not verify_secret(data.password, password_hash)
        or not verify_secret(data.pin.strip(), pin_hash)
    ):
        raise HTTPException(status_code=401, detail="Invalid administrator credentials.")
    return {"access_token": issue_token(admin_email, "admin"), "token_type": "bearer"}

@app.get("/admin/settings", summary="Get owner banking settings")
def get_owner_settings(_: dict = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(OwnerSettings).first()

@app.put("/admin/settings", summary="Update owner banking settings")
def update_owner_settings(data: OwnerSettingsUpdate, _: dict = Depends(require_admin), db: Session = Depends(get_db)):
    settings = db.query(OwnerSettings).first()
    if not settings:
        settings = OwnerSettings(**data.dict())
        db.add(settings)
    else:
        settings.bank_name = data.bank_name
        settings.account_type = data.account_type
        settings.account_number = data.account_number
        settings.account_holder = data.account_holder
    db.commit()
    return {"message": "Banking details updated successfully."}

# --- CLIENT AUTHENTICATION ENDPOINTS ---
@app.post("/clients/register")
def register_client(data: ClientRegister, db: Session = Depends(get_db)):
    if len(data.pin.strip()) != 4 or not data.pin.strip().isdigit():
        raise HTTPException(status_code=400, detail="PIN must be 4 numeric digits.")
    existing = db.query(ClientAccount).filter(ClientAccount.email.ilike(data.email.strip())).first()
    if existing:
        raise HTTPException(status_code=400, detail="Account already exists.")
    new_client = ClientAccount(
        email=data.email.strip().lower(),
        password=hash_secret(data.password),
        pin=hash_secret(data.pin.strip()),
        penalty_balance=0.0,
        is_verified=True,
    )
    db.add(new_client)
    db.commit()
    return {"message": "Registered successfully."}

@app.post("/clients/login")
def client_login(data: ClientLogin, db: Session = Depends(get_db)):
    client = db.query(ClientAccount).filter(ClientAccount.email.ilike(data.email.strip())).first()
    if not client:
        raise HTTPException(status_code=401, detail="Invalid email, password, or PIN.")
    password_matches = verify_client_secret(data.password, client.password)
    pin_matches = verify_client_secret(data.pin.strip(), client.pin)
    if not password_matches or not pin_matches:
        raise HTTPException(status_code=401, detail="Invalid email, password, or PIN.")
    if not client.password.startswith("pbkdf2_sha256$"):
        client.password = hash_secret(data.password)
    if not client.pin.startswith("pbkdf2_sha256$"):
        client.pin = hash_secret(data.pin.strip())
    db.commit()
    return {
        "message": "Login successful",
        "email": client.email,
        "penalty_balance": client.penalty_balance,
        "access_token": issue_token(client.email, "client", auth_version=client_auth_version(client)),
        "token_type": "bearer",
    }

@app.get("/clients/profile")
def client_profile(claims: dict = Depends(require_client), db: Session = Depends(get_db)):
    client = db.query(ClientAccount).filter(ClientAccount.email.ilike(claims["sub"])).first()
    if not client:
        raise HTTPException(status_code=401, detail="Client account is no longer available.")
    return {"penalty_balance": client.penalty_balance}

@app.post("/clients/forgot-password")
def forgot_password(data: ClientPasswordResetRequest, db: Session = Depends(get_db)):
    client = db.query(ClientAccount).filter(ClientAccount.email.ilike(data.email.strip())).first()
    if not client or not verify_client_secret(data.password, client.password):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    if not client.password.startswith("pbkdf2_sha256$"):
        client.password = hash_secret(data.password)
        db.commit()
    return {
        "message": "Verified.",
        "reset_token": issue_token(
            client.email,
            "client",
            purpose="password_reset",
            auth_version=client_auth_version(client),
        ),
    }

@app.post("/clients/reset-credentials")
def reset_credentials(data: ClientPasswordReset, claims: dict = Depends(require_password_reset), db: Session = Depends(get_db)):
    if len(data.new_pin.strip()) != 4 or not data.new_pin.strip().isdigit():
        raise HTTPException(status_code=400, detail="PIN must be 4 numeric digits.")
    client = db.query(ClientAccount).filter(ClientAccount.email.ilike(claims["sub"])).first()
    if not client:
        raise HTTPException(status_code=404, detail="Account not found.")
    client.password = hash_secret(data.new_password)
    client.pin = hash_secret(data.new_pin.strip())
    db.commit()
    return {"message": "Updated successfully."}

# --- SERVICES & APPOINTMENTS ---
@app.get("/services/")
def list_services(db: Session = Depends(get_db)):
    return db.query(Service).all()

@app.get("/appointments/")
def list_appointments(db: Session = Depends(get_db)):
    return [
        {"id": appointment.id, "start_time": appointment.start_time, "end_time": appointment.end_time}
        for appointment in db.query(Appointment).all()
    ]

@app.get("/admin/appointments/")
def list_admin_appointments(_: dict = Depends(require_admin), db: Session = Depends(get_db)):
    return [
        appointment_response(appointment, include_contact=True)
        for appointment in db.query(Appointment).all()
    ]

@app.get("/appointments/client")
def get_client_appointments(claims: dict = Depends(require_client), db: Session = Depends(get_db)):
    return [
        appointment_response(appointment)
        for appointment in db.query(Appointment).filter(Appointment.client_email.ilike(claims["sub"])).all()
    ]

@app.post("/appointments/")
def create_appointment(
    appointment: AppointmentCreate,
    claims: Optional[dict] = Depends(get_optional_token_claims),
    db: Session = Depends(get_db),
):
    start_dt = appointment.start_time
    if start_dt.tzinfo is not None:
        start_dt = start_dt.replace(tzinfo=None)

    if start_dt < datetime.utcnow() - timedelta(minutes=2):
        raise HTTPException(status_code=400, detail="Cannot book appointments in the past.")

    conflicting = db.query(Appointment).filter(
        and_(
            Appointment.start_time < appointment.end_time,
            Appointment.end_time > appointment.start_time
        )
    ).first()
    if conflicting:
        raise HTTPException(
            status_code=400,
            detail=f"Time slot overlaps with an existing appointment (#{conflicting.id}) spanning from {conflicting.start_time.strftime('%H:%M')} to {conflicting.end_time.strftime('%H:%M')}."
        )

    service = db.query(Service).filter(Service.id == appointment.service_id).first()
    service_price = service.price if service else 0.0

    client = db.query(ClientAccount).filter(ClientAccount.email.ilike(appointment.client_email.strip())).first()
    applied_penalty = 0.0
    if client and (not claims or claims.get("sub", "").lower() != client.email.lower()):
        raise HTTPException(status_code=401, detail="Log in to book with this account.")
    if client and client.penalty_balance > 0:
        applied_penalty = client.penalty_balance
        client.penalty_balance = 0.0

    total_paid = service_price + applied_penalty

    db_appointment = Appointment(
        service_id=appointment.service_id,
        client_name=appointment.client_name,
        client_email=appointment.client_email,
        client_phone=appointment.client_phone,
        start_time=appointment.start_time,
        end_time=appointment.end_time,
        payment_method=appointment.payment_method,
        bank_name=None,
        account_type=None,
        account_number=None,
        client_account_holder=None,
        reminder_sent=False
    )
    db.add(db_appointment)
    db.commit()
    db.refresh(db_appointment)

    owner_settings = db.query(OwnerSettings).first()
    owner_bank_dict = {
        "bank_name": owner_settings.bank_name if owner_settings else "Standard Bank",
        "account_type": owner_settings.account_type if owner_settings else "Cheque",
        "account_number": owner_settings.account_number if owner_settings else "",
        "account_holder": owner_settings.account_holder if owner_settings else "Yusuf Arrison"
    }

    email_status = send_booking_notifications(db_appointment.client_name, db_appointment.client_email, db_appointment.client_phone, service.name if service else "Service", db_appointment.start_time, db_appointment.id, db_appointment.payment_method, total_paid, owner_bank_dict)
    return {"total_paid": total_paid, "applied_penalty": applied_penalty, "email_status": email_status}

@app.delete("/appointments/{appointment_id}")
def cancel_appointment(
    appointment_id: int,
    claims: dict = Depends(require_client),
    db: Session = Depends(get_db),
):
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise HTTPException(status_code=404, detail="Not found.")
    if appointment.client_email.lower() != claims["sub"].lower():
        raise HTTPException(status_code=403, detail="You can only cancel your own bookings.")

    now = datetime.utcnow()
    time_to_start = (appointment.start_time - now).total_seconds()
    is_late_cancellation = time_to_start <= (24 * 3600)

    penalty_fee = 0.0
    if is_late_cancellation:
        service = db.query(Service).filter(Service.id == appointment.service_id).first()
        service_price = service.price if service else 0.0
        penalty_fee = service_price * 0.50

        client = db.query(ClientAccount).filter(ClientAccount.email.ilike(appointment.client_email.strip())).first()
        if client:
            client.penalty_balance += penalty_fee
            db.commit()

    db.delete(appointment)
    db.commit()
    return {"message": "Cancelled.", "penalty_applied": penalty_fee, "payment_method": appointment.payment_method, "is_late_cancellation": is_late_cancellation}

@app.delete("/admin/appointments/{appointment_id}")
def owner_cancel_appointment(appointment_id: int, _: dict = Depends(require_admin), db: Session = Depends(get_db)):
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise HTTPException(status_code=404, detail="Not found.")

    now = datetime.utcnow()
    time_to_start = (appointment.start_time - now).total_seconds()
    is_late_cancellation = time_to_start <= (24 * 3600)

    service = db.query(Service).filter(Service.id == appointment.service_id).first()
    service_name = service.name if service else "Service"
    client_name = appointment.client_name
    client_email = appointment.client_email
    start_time = appointment.start_time
    payment_method = appointment.payment_method
    db.delete(appointment)
    db.commit()
    email_status = send_owner_cancellation_notification(
        client_name,
        client_email,
        service_name,
        start_time,
        payment_method,
        is_late_cancellation,
    )
    return {"message": "Owner cancelled.", "email_status": email_status}

@app.put("/admin/appointments/{appointment_id}")
def owner_update_appointment(appointment_id: int, appointment_update: AppointmentUpdate, _: dict = Depends(require_admin), db: Session = Depends(get_db)):
    db_appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not db_appointment:
        raise HTTPException(status_code=404, detail="Appointment not found.")

    update_data = appointment_update.dict(exclude_unset=True)
    if "start_time" in update_data or "end_time" in update_data:
        check_start = update_data.get("start_time", db_appointment.start_time)
        check_end = update_data.get("end_time", db_appointment.end_time)

        conflicting = db.query(Appointment).filter(
            Appointment.id != appointment_id,
            and_(
                Appointment.start_time < check_end,
                Appointment.end_time > check_start
            )
        ).first()
        if conflicting:
            raise HTTPException(status_code=400, detail="Updated time slot overlaps with another appointment.")

    for key, value in update_data.items():
        setattr(db_appointment, key, value)

    db.commit()
    db.refresh(db_appointment)
    return db_appointment