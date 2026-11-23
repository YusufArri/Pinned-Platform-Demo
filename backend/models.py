import datetime
from database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship


class Service(Base):
  __tablename__ = "services"

  id = Column(Integer, primary_key=True, index=True)
  name = Column(String, index=True, nullable=False)
  description = Column(String)
  duration_minutes = Column(Integer, nullable=False)
  price = Column(Integer, nullable=False)

  appointments = relationship("Appointment", back_populates="service")


class Appointment(Base):
  __tablename__ = "appointments"

  id = Column(Integer, primary_key=True, index=True)
  client_name = Column(String, index=True, nullable=False)
  client_email = Column(String, index=True, nullable=False)
  service_id = Column(Integer, ForeignKey("services.id"), nullable=False)
  start_time = Column(DateTime, nullable=False)
  end_time = Column(DateTime, nullable=False)
  status = Column(String, default="Confirmed")

  service = relationship("Service", back_populates="appointments")