import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

const getEmailDeliveryMessage = (status) => {
  if (status === 'accepted') return 'Email request accepted by Resend; delivery is not guaranteed.';
  if (status === 'failed') return 'The email could not be sent.';
  return 'Email is not configured; no email was sent.';
};

const PLACEHOLDER_SERVICES = [
  { id: 9001, name: "Strategy Consultation", description: "Placeholder: discuss goals, priorities, and a proposed project roadmap.", price: 850, duration_minutes: 30 },
  { id: 9002, name: "Code Review Session", description: "Placeholder: review a codebase, architecture, risks, and next steps.", price: 2000, duration_minutes: 60 },
  { id: 9003, name: "UI/UX Design Session", description: "Placeholder: review layouts, visual direction, accessibility, and user experience.", price: 1300, duration_minutes: 45 },
  { id: 9004, name: "Development Consultation", description: "Placeholder: technical discovery for a website or application project.", price: 950, duration_minutes: 45 },
];

const BANK_LIST = [
  "Capitec Bank",
  "First National Bank (FNB)",
  "Nedbank",
  "Standard Bank",
  "Absa",
  "TymeBank",
  "Discovery Bank",
  "---",
  "African Bank",
  "Bidvest Bank",
  "Grindrod Bank",
  "Investec",
  "Mercantile Bank",
  "Sasfin Bank",
  "Standard Chartered South Africa",
  "The South African Post Bank (Postbank)"
];

function App() {
  const [isOwnerMode, setIsOwnerMode] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [adminToken, setAdminToken] = useState(null);
  const adminTokenRef = useRef(null);

  // Admin Login Inputs
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPin, setAdminPin] = useState('');

  // Data States
  const [services, setServices] = useState(PLACEHOLDER_SERVICES);
  const [appointments, setAppointments] = useState([]);
  const [selectedService, setSelectedService] = useState(null);

  // Client Booking Form States
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [clientPenaltyBalance, setClientPenaltyBalance] = useState(0.0);

  // Owner Dashboard Tabs & Settings
  const [ownerTab, setOwnerTab] = useState('active'); // 'active', 'completed', 'settings'
  const [ownerBankName, setOwnerBankName] = useState('Nedbank');
  const [ownerAccountType, setOwnerAccountType] = useState('Cheque');
  const [ownerAccountNumber, setOwnerAccountNumber] = useState('');
  const [ownerAccountHolder, setOwnerAccountHolder] = useState('');

  // Client Portal Tabs
  const [clientTab, setClientTab] = useState('active'); // 'active', 'completed'

  // Client Authentication & Portal States
  const [clientAuthEmail, setClientAuthEmail] = useState('');
  const [clientAuthPin, setClientAuthPin] = useState('');
  const [clientAuthPassword, setClientAuthPassword] = useState('');
  const [clientAuthToken, setClientAuthToken] = useState(null);
  const clientAuthTokenRef = useRef(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [loggedInClientEmail, setLoggedInClientEmail] = useState(null);
  const [myBookings, setMyBookings] = useState([]);

  // Forgot PIN / Password States
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotPassword, setForgotPassword] = useState('');
  const [passwordResetToken, setPasswordResetToken] = useState(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPin, setNewPin] = useState('');

  // Owner Action Modals
  const [ownerCancelModal, setOwnerCancelModal] = useState(false);
  const [appointmentToOwnerCancel, setAppointmentToOwnerCancel] = useState(null);
  const [ownerEditModal, setOwnerEditModal] = useState(false);
  const [appointmentToEdit, setAppointmentToEdit] = useState(null);
  const [editClientName, setEditClientName] = useState('');
  const [editClientEmail, setEditClientEmail] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editServiceId, setEditServiceId] = useState('');

  const [statusMessage, setStatusMessage] = useState({ text: '', type: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [appointmentToCancel, setAppointmentToCancel] = useState(null);

  // Computed min datetime string for local time inputs
  const getMinDateTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${mins}`;
  };
  const minDateTime = getMinDateTime();

  useEffect(() => {
    localStorage.removeItem('pinned_client_email');
    localStorage.removeItem('pinned_saved_bank');
  }, []);

  useEffect(() => {
    adminTokenRef.current = adminToken;
  }, [adminToken]);

  useEffect(() => {
    clientAuthTokenRef.current = clientAuthToken;
  }, [clientAuthToken]);

  const adminHeaders = useCallback(() => ({ Authorization: `Bearer ${adminToken}` }), [adminToken]);
  const clientHeaders = (token = clientAuthToken) => ({ Authorization: `Bearer ${token}` });

  const fetchData = useCallback((includePrivateBookings = false) => {
    fetch(`${API_BASE_URL}/services/`)
      .then((res) => res.json())
      .then((data) => setServices(Array.isArray(data) && data.length > 0 ? data : PLACEHOLDER_SERVICES))
      .catch((err) => {
        console.error('Error fetching services:', err);
        setServices(PLACEHOLDER_SERVICES);
      });

    fetch(`${API_BASE_URL}${includePrivateBookings ? '/admin/appointments/' : '/appointments/'}`, {
      headers: includePrivateBookings ? adminHeaders() : undefined,
    })
      .then((res) => res.json())
      .then((data) => setAppointments(data))
      .catch((err) => console.error('Error fetching appointments:', err));
  }, [adminHeaders]);

  const fetchOwnerSettings = useCallback(() => {
    fetch(`${API_BASE_URL}/admin/settings`, { headers: adminHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setOwnerBankName(data.bank_name || 'Nedbank');
          setOwnerAccountType(data.account_type || 'Cheque');
          setOwnerAccountNumber(data.account_number || '');
          setOwnerAccountHolder(data.account_holder || '');
        }
      })
      .catch((err) => console.error('Error fetching owner settings:', err));
  }, [adminHeaders]);

  useEffect(() => {
    fetchData(isOwnerMode && Boolean(adminToken));
  }, [isOwnerMode, adminToken, fetchData]);

  useEffect(() => {
    if (isOwnerMode && adminToken) {
      fetchOwnerSettings();
    }
  }, [isOwnerMode, adminToken, fetchOwnerSettings]);

  const fetchClientProfile = async (token = clientAuthToken) => {
    try {
      const res = await fetch(`${API_BASE_URL}/clients/profile`, { headers: clientHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setClientPenaltyBalance(data.penalty_balance || 0.0);
      }
    } catch (err) { console.error(err); }
  };

  const handleSaveOwnerSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/admin/settings`, {
        method: 'PUT',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank_name: ownerBankName,
          account_type: ownerAccountType,
          account_number: ownerAccountNumber,
          account_holder: ownerAccountHolder
        })
      });
      if (res.ok) {
        alert('Business banking details updated successfully!');
      } else {
        alert('Failed to update banking details.');
      }
    } catch (err) { console.error(err); }
  };

  const fetchClientBookings = async (token = clientAuthToken) => {
    try {
      const res = await fetch(`${API_BASE_URL}/appointments/client`, { headers: clientHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setMyBookings(data);
      }
    } catch (err) {
      console.error('Error fetching client bookings:', err);
    }
  };

  const handleBooking = async (e) => {
    e.preventDefault();
    if (!selectedService) {
      setStatusMessage({ text: 'Please select a service from the grid above.', type: 'error' });
      return;
    }

    setStatusMessage({ text: '', type: '' });
    setIsSubmitting(true);

    const chosenService = services.find((s) => s.id === selectedService);
    const durationMins = chosenService ? chosenService.duration_minutes : 30;

    const [datePart, timePart] = appointmentTime.split('T');
    const startDateStr = `${datePart}T${timePart}:00`;

    const startDateObj = new Date(`${datePart}T${timePart}:00`);
    const endDateObj = new Date(startDateObj.getTime() + durationMins * 60000);

    const endYear = endDateObj.getFullYear();
    const endMonth = String(endDateObj.getMonth() + 1).padStart(2, '0');
    const endDay = String(endDateObj.getDate()).padStart(2, '0');
    const endHours = String(endDateObj.getHours()).padStart(2, '0');
    const endMins = String(endDateObj.getMinutes()).padStart(2, '0');
    const endDateStr = `${endYear}-${endMonth}-${endDay}T${endHours}:${endMins}:00`;

    const newAppointment = {
      service_id: selectedService,
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
      start_time: startDateStr,
      end_time: endDateStr,
      payment_method: paymentMethod,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/appointments/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(clientAuthToken ? clientHeaders() : {}),
        },
        body: JSON.stringify(newAppointment),
      });

      if (response.ok) {
        const data = await response.json();
        setStatusMessage({ text: `Booking confirmed! Total paid: R${data.total_paid.toFixed(2)} ${clientPenaltyBalance > 0 ? `(includes R${clientPenaltyBalance.toFixed(2)} previous penalty fee)` : ''}. ${getEmailDeliveryMessage(data.email_status)}`, type: 'success' });
        fetchData();
        setSelectedService(null);
        setClientName('');
        setClientEmail('');
        setClientPhone('');
        setAppointmentTime('');
        setClientPenaltyBalance(0.0);
        if (loggedInClientEmail && loggedInClientEmail.toLowerCase() === clientEmail.toLowerCase()) {
          fetchClientBookings();
          fetchClientProfile();
        }
      } else {
        const errData = await response.json();
        setStatusMessage({ text: errData.detail || 'Failed to book appointment.', type: 'error' });
      }
    } catch (err) {
      console.error('Error booking appointment:', err);
      setStatusMessage({ text: 'Network error connecting to backend.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeOwnerCancellation = async () => {
    if (!appointmentToOwnerCancel) return;
    try {
      const response = await fetch(`${API_BASE_URL}/admin/appointments/${appointmentToOwnerCancel.id}`, {
        method: 'DELETE',
        headers: adminHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        alert(`Owner cancellation processed. ${getEmailDeliveryMessage(data.email_status)}`);
        fetchData(true);
      } else {
        alert('Failed to process owner cancellation.');
      }
    } catch (err) { console.error(err); }
    finally { setOwnerCancelModal(false); setAppointmentToOwnerCancel(null); }
  };

  const handleOwnerEditSubmit = async (e) => {
    e.preventDefault();
    if (!appointmentToEdit) return;

    const chosenService = services.find((s) => s.id === parseInt(editServiceId));
    const durationMins = chosenService ? chosenService.duration_minutes : 30;

    const [datePart, timePart] = editStartTime.split('T');
    const startDateStr = `${datePart}T${timePart}:00`;

    const startDateObj = new Date(`${datePart}T${timePart}:00`);
    const endDateObj = new Date(startDateObj.getTime() + durationMins * 60000);

    const endYear = endDateObj.getFullYear();
    const endMonth = String(endDateObj.getMonth() + 1).padStart(2, '0');
    const endDay = String(endDateObj.getDate()).padStart(2, '0');
    const endHours = String(endDateObj.getHours()).padStart(2, '0');
    const endMins = String(endDateObj.getMinutes()).padStart(2, '0');
    const endDateStr = `${endYear}-${endMonth}-${endDay}T${endHours}:${endMins}:00`;

    try {
      const response = await fetch(`${API_BASE_URL}/admin/appointments/${appointmentToEdit.id}`, {
        method: 'PUT',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: parseInt(editServiceId),
          client_name: editClientName,
          client_email: editClientEmail,
          client_phone: editClientPhone,
          start_time: startDateStr,
          end_time: endDateStr
        })
      });

      if (response.ok) {
        alert('Appointment updated successfully!');
        fetchData(true);
        setOwnerEditModal(false);
        setAppointmentToEdit(null);
      } else {
        const err = await response.json();
        alert(err.detail || 'Failed to update appointment.');
      }
    } catch (err) { console.error(err); }
  };

  const handleClientAuth = async (e) => {
    e.preventDefault();
    if (isRegistering) {
      try {
        const res = await fetch(`${API_BASE_URL}/clients/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: clientAuthEmail, password: clientAuthPassword, pin: clientAuthPin })
        });
        if (res.ok) {
          alert('Account registered! You can now log in.');
          setIsRegistering(false);
          setClientAuthPassword('');
        } else {
          const err = await res.json();
          alert(err.detail || 'Registration failed.');
        }
      } catch (err) { console.error(err); }
    } else {
      try {
        const res = await fetch(`${API_BASE_URL}/clients/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: clientAuthEmail, password: clientAuthPassword, pin: clientAuthPin })
        });
        if (res.ok) {
          const data = await res.json();
          setClientAuthToken(data.access_token);
          setLoggedInClientEmail(data.email);
          setClientPenaltyBalance(data.penalty_balance || 0.0);
          window.setTimeout(() => {
            if (clientAuthTokenRef.current === data.access_token) {
              setClientAuthToken(null);
              setLoggedInClientEmail(null);
              setMyBookings([]);
              setClientPenaltyBalance(0.0);
            }
          }, 8 * 60 * 60 * 1000);
          setClientAuthEmail('');
          setClientAuthPassword('');
          setClientAuthPin('');
          fetchClientBookings(data.access_token);
          fetchClientProfile(data.access_token);
        } else {
          const error = await res.json();
          alert(error.detail || 'Invalid email, password, or PIN.');
        }
      } catch (err) { console.error(err); }
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/clients/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, password: forgotPassword })
      });
      if (res.ok) {
        const data = await res.json();
        setPasswordResetToken(data.reset_token);
        setForgotModalOpen(false);
        setResetModalOpen(true);
        setForgotPassword('');
      } else {
        const err = await res.json();
        alert(err.detail || 'Verification failed.');
      }
    } catch (err) { console.error(err); }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/clients/reset-credentials`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${passwordResetToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPassword, new_pin: newPin })
      });
      if (res.ok) {
        alert('Credentials successfully updated!');
        setResetModalOpen(false);
        setForgotEmail(''); setForgotPassword(''); setNewPassword(''); setNewPin('');
        setPasswordResetToken(null);
      } else {
        const err = await res.json();
        alert(err.detail || 'Failed to update credentials.');
      }
    } catch (err) { console.error(err); }
  };

  const confirmClientCancellation = async () => {
    if (!appointmentToCancel) return;
    try {
      const response = await fetch(`${API_BASE_URL}/appointments/${appointmentToCancel.id}`, {
        method: 'DELETE',
        headers: clientHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        let msg = 'Appointment cancelled successfully. ';
        if (data.payment_method === 'Bank Transfer') {
          msg += data.is_late_cancellation ? 'Eligible for 50% refund.' : 'Full (100%) refund issued.';
        } else {
          msg += data.is_late_cancellation ? 'Account flagged with 50% penalty fee applied to next booking.' : 'Cancelled early with no penalty fee.';
        }
        setStatusMessage({ text: msg, type: 'success' });
        fetchData();
        if (loggedInClientEmail) {
          fetchClientBookings();
          fetchClientProfile();
        }
      }
    } catch (err) { console.error(err); }
    finally { setCancelModalOpen(false); setAppointmentToCancel(null); }
  };

  const handleAdminLoginSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, password: adminPassword, pin: adminPin }),
      });
      if (response.ok) {
        const data = await response.json();
        setAdminToken(data.access_token);
        setIsOwnerMode(true);
        setPinModalOpen(false);
        window.setTimeout(() => {
          if (adminTokenRef.current === data.access_token) {
            leaveOwnerMode();
          }
        }, 8 * 60 * 60 * 1000);
        setAdminEmail('');
        setAdminPassword('');
        setAdminPin('');
      } else {
        const error = await response.json();
        alert(error.detail || 'Invalid administrator credentials.');
        setAdminPin('');
      }
    } catch (error) {
      console.error('Administrator sign-in failed:', error);
      alert('Unable to connect to the server.');
    }
  };

  const leaveOwnerMode = () => {
    setAdminToken(null);
    setIsOwnerMode(false);
    setAppointments([]);
    setOwnerAccountNumber('');
    setOwnerAccountHolder('');
    setOwnerBankName('');
    setOwnerAccountType('');
    fetchData();
  };

  const parseLocalDate = (dateString) => {
    if (!dateString) return new Date(0);
    const clean = dateString.replace('Z', '').split('+')[0];
    return new Date(clean);
  };

  const now = new Date();
  const activeAppointments = appointments.filter(apt => parseLocalDate(apt.end_time) >= now);
  const completedAppointments = appointments.filter(apt => parseLocalDate(apt.end_time) < now);

  const myActiveBookings = myBookings.filter(apt => parseLocalDate(apt.end_time) >= now);
  const myCompletedBookings = myBookings.filter(apt => parseLocalDate(apt.end_time) < now);

  const getServiceName = (serviceId) => {
    const s = services.find(item => item.id === serviceId);
    return s ? s.name : 'General Service';
  };

  const getServicePrice = (serviceId) => {
    const s = services.find(item => item.id === serviceId);
    return s ? s.price : 0;
  };

  const chosenServiceObj = services.find(s => s.id === selectedService);
  const baseServicePrice = chosenServiceObj ? chosenServiceObj.price : 0;
  const computedTotalDue = baseServicePrice + clientPenaltyBalance;

  const aptStartTime = appointmentToCancel ? parseLocalDate(appointmentToCancel.start_time) : new Date();
  const isLateCancellationModal = (aptStartTime - new Date()) <= (24 * 3600 * 1000);

  const formatZADate = (dateString) => {
    if (!dateString) return '';
    const clean = dateString.replace('Z', '').split('+')[0];
    const [datePart, timePart] = clean.split('T');
    if (!datePart || !timePart) return dateString;
    const [year, month, day] = datePart.split('-');
    const [hour, minute] = timePart.split(':');
    return `${day}/${month}/${year}, ${hour}:${minute}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      <div>
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-gradient-to-r from-indigo-950 via-indigo-900 to-violet-950 text-white shadow-2xl py-5 px-8 border-b border-white/10">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center space-x-4">
              <div className="bg-white/90 backdrop-blur-md p-2 rounded-2xl shadow-lg border border-white/20 flex items-center justify-center">
                <span className="text-xl font-black text-indigo-950 px-2">P!</span>
              </div>
              <div>
                <div className="flex items-center space-x-2.5">
                  <h1 className="text-2xl font-extrabold tracking-tight text-white">Pinned!</h1>
                  <span className="bg-white/10 backdrop-blur-md text-indigo-100 text-xs px-3 py-1 rounded-full font-semibold border border-white/20 shadow-inner">
                    {isOwnerMode ? '🔒 Owner Mode' : 'v1.0 ZA'}
                  </span>
                </div>
                <p className="text-indigo-200/90 text-sm mt-0.5 font-medium">
                  {isOwnerMode ? 'Business Management Dashboard' : 'Seamless Appointment & Service Booking Platform'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {isOwnerMode ? (
                <button onClick={leaveOwnerMode} className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 py-2.5 rounded-2xl border border-white/20 backdrop-blur-md transition-all shadow-sm">
                  Switch to Client View
                </button>
              ) : (
                <button onClick={() => setPinModalOpen(true)} className="bg-indigo-900/60 hover:bg-indigo-900/90 text-indigo-100 text-xs font-bold px-4 py-2.5 rounded-2xl border border-indigo-500/30 backdrop-blur-md transition-all shadow-sm">
                  Owner Portal
                </button>
              )}
            </div>
          </div>
        </header>

        <aside className="bg-amber-50 border-b border-amber-200 px-6 py-3 text-center text-xs text-amber-950">
          Portfolio demo only: do not submit real personal or banking details. Resend email is sent only when configured; its free/test sender may restrict recipients, and delivery is not guaranteed. SMS is simulated; no text messages are sent.
        </aside>

        {!isOwnerMode && (
          <section className="mx-auto mt-8 max-w-6xl px-6">
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-800 px-7 py-9 text-white shadow-2xl shadow-indigo-950/15 sm:px-10 sm:py-12">
              <div className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full border-[36px] border-white/5" />
              <div className="pointer-events-none absolute bottom-[-7rem] right-40 h-56 w-56 rounded-full bg-violet-400/20 blur-3xl" />
              <div className="relative max-w-2xl">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-indigo-200">A calmer way to book</p>
                <h2 className="max-w-xl text-3xl font-black leading-tight tracking-tight sm:text-4xl">Make space for your next great idea.</h2>
                <p className="mt-4 max-w-xl text-sm leading-6 text-indigo-100/85">Choose a service, find a time that works, and keep your appointments in one simple place.</p>
                <div className="mt-7 flex flex-wrap gap-2 text-[11px] font-semibold">
                  <span className="rounded-full border border-white/15 bg-white/10 px-3 py-2">South Africa · SAST</span>
                  <span className="rounded-full border border-white/15 bg-white/10 px-3 py-2">Clear cancellation terms</span>
                  <span className="rounded-full border border-white/15 bg-white/10 px-3 py-2">Client portal available</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {isOwnerMode ? (
          <main className="max-w-6xl mx-auto py-10 px-6 space-y-10">
            <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b border-slate-100 pb-4 gap-4">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setOwnerTab('active')}
                    className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${ownerTab === 'active' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    Active Bookings ({activeAppointments.length})
                  </button>
                  <button
                    onClick={() => setOwnerTab('completed')}
                    className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${ownerTab === 'completed' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    Past / Completed ({completedAppointments.length})
                  </button>
                  <button
                    onClick={() => setOwnerTab('settings')}
                    className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${ownerTab === 'settings' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    🏦 Payout Banking Details
                  </button>
                </div>
                <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-xl border border-indigo-100">
                  {appointments.length} Total Bookings
                </span>
              </div>

              {ownerTab === 'settings' ? (
                <form onSubmit={handleSaveOwnerSettings} className="max-w-xl space-y-5 py-4">
                  <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-6 rounded-3xl shadow-xl space-y-2">
                    <h3 className="text-base font-extrabold tracking-tight">Configure Payout Bank Details</h3>
                    <p className="text-xs text-indigo-200 leading-relaxed">Select your preferred South African bank and enter account details where client EFT payments will be routed.</p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-2">Select Bank</label>
                    <div className="relative">
                      <select value={ownerBankName} onChange={e => setOwnerBankName(e.target.value)} required className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition-all appearance-none shadow-sm cursor-pointer">
                        {BANK_LIST.map((b, idx) => b === '---' ? <option key={idx} disabled>────────── (Popular / Alphabetical) ──────────</option> : <option key={idx} value={b}>{b}</option>)}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">▼</div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-2">Account Holder Name</label>
                    <input type="text" value={ownerAccountHolder} onChange={e => setOwnerAccountHolder(e.target.value)} placeholder="Business Name or Full Name" required className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition-all shadow-sm" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-2">Account Type</label>
                      <div className="relative">
                        <select value={ownerAccountType} onChange={e => setOwnerAccountType(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition-all appearance-none shadow-sm cursor-pointer">
                          <option value="Cheque">Cheque / Current</option>
                          <option value="Savings">Savings</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">▼</div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-2">Account Number</label>
                      <input type="text" value={ownerAccountNumber} onChange={e => setOwnerAccountNumber(e.target.value)} placeholder="Enter business account number" required className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 transition-all shadow-sm" />
                    </div>
                  </div>

                  <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-8 rounded-2xl text-xs shadow-lg shadow-indigo-600/30 transition-all transform active:scale-[0.99]">Save Banking Details</button>
                </form>
              ) : (
                <div>
                  {((ownerTab === 'active' ? activeAppointments : completedAppointments).length === 0) ? (
                    <div className="text-center py-12 px-4 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                      <div className="text-3xl mb-2">📋</div>
                      <p className="text-sm font-bold text-slate-700">No {ownerTab} appointments found</p>
                      <p className="text-xs text-slate-400 mt-1">Bookings will appear here accordingly.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-xs">
                            <th className="pb-3 pl-2">ID</th>
                            <th className="pb-3">Client</th>
                            <th className="pb-3">Service Requested</th>
                            <th className="pb-3">Date & Time (DD/MM/YYYY)</th>
                            <th className="pb-3">Payment</th>
                            <th className="pb-3 text-right pr-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(ownerTab === 'active' ? activeAppointments : completedAppointments).map((apt) => (
                            <tr key={apt.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-4 pl-2 font-bold text-indigo-600">#{apt.id}</td>
                              <td className="py-4 font-bold text-slate-900">
                                {apt.client_name}
                                <span className="block text-xs font-normal text-slate-500">{apt.client_email} | {apt.client_phone}</span>
                              </td>
                              <td className="py-4 font-bold text-indigo-900">
                                {getServiceName(apt.service_id)} (R{getServicePrice(apt.service_id).toFixed(2)})
                              </td>
                              <td className="py-4 text-slate-700 font-medium font-mono text-xs">
                                {formatZADate(apt.start_time)}
                              </td>
                              <td className="py-4 text-xs font-semibold text-slate-600">
                                <span className={`px-2.5 py-1 rounded-xl border ${apt.payment_method === 'Cash' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
                                  {apt.payment_method}
                                </span>
                              </td>
                              <td className="py-4 text-right pr-2 space-x-2">
                                {ownerTab === 'active' && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setAppointmentToEdit(apt);
                                        setEditClientName(apt.client_name);
                                        setEditClientEmail(apt.client_email);
                                        setEditClientPhone(apt.client_phone);
                                        setEditServiceId(apt.service_id);
                                        const clean = (apt.start_time || '').replace('Z', '').split('+')[0];
                                        setEditStartTime(clean.slice(0, 16));
                                        setOwnerEditModal(true);
                                      }}
                                      className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold px-3.5 py-2 rounded-xl text-xs border border-indigo-200 transition-all shadow-sm"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => {
                                        setAppointmentToOwnerCancel(apt);
                                        setOwnerCancelModal(true);
                                      }}
                                      className="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-3.5 py-2 rounded-xl text-xs border border-rose-200 transition-all shadow-sm"
                                    >
                                      Owner Cancel
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>
        ) : (
          <main className="max-w-6xl mx-auto py-10 px-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
            <section className="lg:col-span-7 bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
              <h2 className="text-xl font-bold text-slate-900 mb-6 border-b border-slate-100 pb-4">Book an Appointment</h2>

              {statusMessage.text && (
                <div className={`mb-6 p-4 rounded-2xl text-sm font-medium border animate-fadeIn ${statusMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                  {statusMessage.text}
                </div>
              )}

              {clientPenaltyBalance > 0 && (
                <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center justify-between">
                  <span>⚠️ Pending Penalty Fee: +R{clientPenaltyBalance.toFixed(2)} (from previous late cancellation). Automatically added to total below.</span>
                </div>
              )}

              <form onSubmit={handleBooking} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-3">Select Service</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {services.map((service) => {
                      const isSelected = selectedService === service.id;
                      return (
                        <div
                          key={service.id}
                          onClick={() => setSelectedService(service.id)}
                          className={`cursor-pointer p-5 rounded-3xl border-2 transition-all duration-300 transform hover:-translate-y-1 ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-50/70 shadow-lg shadow-indigo-100 ring-4 ring-indigo-500/10'
                              : 'border-slate-100 bg-white hover:border-indigo-200 hover:shadow-md'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-slate-900 text-sm">{service.name}</h3>
                            <span className="text-xs font-extrabold px-3 py-1 rounded-xl bg-indigo-100/70 text-indigo-800">R{service.price.toFixed(2)}</span>
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-relaxed">{service.description}</p>
                          <div className="flex items-center text-xs text-slate-400 font-semibold gap-1">
                            <span>⏱️</span> {service.duration_minutes} mins
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">Your Name</label>
                    <input type="text" placeholder="John Doe" value={clientName} onChange={e => setClientName(e.target.value)} required className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">Email Address</label>
                    <input type="email" placeholder="client@example.com" value={clientEmail} onChange={e => setClientEmail(e.target.value)} required className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">Phone Number</label>
                    <input type="tel" placeholder="+27 82 000 0000" value={clientPhone} onChange={e => setClientPhone(e.target.value)} required className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">Appointment Date & Time (DD/MM/YYYY)</label>
                    <input
                      type="datetime-local"
                      lang="en-ZA"
                      min={minDateTime}
                      value={appointmentTime}
                      onChange={e => setAppointmentTime(e.target.value)}
                      required
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
                    />
                  </div>
                </div>

                <div className="bg-slate-50/80 p-6 rounded-3xl border border-slate-200 space-y-5 shadow-sm">
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700">Payment Method</label>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className={`flex items-center justify-center p-4 rounded-2xl border-2 cursor-pointer font-bold text-xs transition-all shadow-sm ${paymentMethod === 'Bank Transfer' ? 'border-indigo-600 bg-indigo-50/90 text-indigo-950 ring-2 ring-indigo-500/20' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                        <input type="radio" name="payMethod" checked={paymentMethod === 'Bank Transfer'} onChange={() => setPaymentMethod('Bank Transfer')} className="hidden" />
                        🏦 Bank Transfer
                      </label>
                      <p className="text-[11px] text-slate-500 mt-2 px-1 leading-relaxed">
                        Cancellations exceeding 24 hours get 100% refund. Within 24 hours incur a 50% cancellation fee.
                      </p>
                    </div>
                    <div className="flex-1">
                      <label className={`flex items-center justify-center p-4 rounded-2xl border-2 cursor-pointer font-bold text-xs transition-all shadow-sm ${paymentMethod === 'Cash' ? 'border-indigo-600 bg-indigo-50/90 text-indigo-950 ring-2 ring-indigo-500/20' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                        <input type="radio" name="payMethod" checked={paymentMethod === 'Cash'} onChange={() => setPaymentMethod('Cash')} className="hidden" />
                        💵 Cash Payment
                      </label>
                      <p className="text-[11px] text-amber-700 mt-2 px-1 leading-relaxed font-medium">
                        Notice: Account flagged if you no-show or cancel within 24 hours (50% penalty fee on next booking).
                      </p>
                    </div>
                  </div>

                  {paymentMethod === 'Bank Transfer' && (
                    <p className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-xs leading-relaxed text-indigo-900">
                      No banking details are collected or saved here. Payment instructions are shared by the business after booking.
                    </p>
                  )}
                </div>

                {selectedService && (
                  <div className="bg-indigo-50/60 p-4 rounded-2xl border border-indigo-100 flex justify-between items-center text-xs font-bold text-indigo-950 shadow-sm">
                    <span>Total Due {clientPenaltyBalance > 0 ? '(Service + Penalty)' : ''}:</span>
                    <span className="text-base font-extrabold text-indigo-700">R{computedTotalDue.toFixed(2)}</span>
                  </div>
                )}

                <button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-600/30 transition-all transform active:scale-[0.99]">
                  {isSubmitting ? 'Processing...' : `Confirm Booking (R${computedTotalDue.toFixed(2)})`}
                </button>
              </form>
            </section>

            <section className="lg:col-span-5 bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-4 border-b border-slate-100 pb-4">Manage My Bookings</h2>

                {!loggedInClientEmail ? (
                  <form onSubmit={handleClientAuth} className="space-y-4">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {isRegistering ? 'Create a password and a 4-digit security PIN. Credentials are stored as salted hashes.' : 'Sign in with your email, password, and 4-digit security PIN.'}
                    </p>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">Email Address</label>
                      <input type="email" value={clientAuthEmail} onChange={e => setClientAuthEmail(e.target.value)} placeholder="client@example.com" required className="w-full rounded-2xl border border-slate-200 p-3.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all" />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">Account Password</label>
                      <input type="password" autoComplete={isRegistering ? 'new-password' : 'current-password'} minLength="8" value={clientAuthPassword} onChange={e => setClientAuthPassword(e.target.value)} placeholder={isRegistering ? 'Choose a secure password' : 'Enter your password'} required className="w-full rounded-2xl border border-slate-200 p-3.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all" />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">4-Digit Security PIN</label>
                      <input type="password" maxLength="4" value={clientAuthPin} onChange={e => setClientAuthPin(e.target.value)} placeholder="••••" required className="w-full rounded-2xl border border-slate-200 p-3.5 text-lg bg-slate-50 tracking-[0.5em] font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all" />
                    </div>

                    {!isRegistering && (
                      <div className="flex justify-between items-center text-xs pt-1">
                        <span className="text-slate-500">This session stays in this tab only.</span>
                        <button type="button" onClick={() => setForgotModalOpen(true)} className="text-indigo-600 font-bold hover:underline">Reset credentials</button>
                      </div>
                    )}

                    <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl text-xs shadow-md shadow-indigo-600/20 transition-all">
                      {isRegistering ? 'Register Account' : 'Log In'}
                    </button>

                    <div className="text-center pt-3">
                      <button type="button" onClick={() => setIsRegistering(!isRegistering)} className="text-xs text-slate-500 hover:text-indigo-600 font-medium underline transition-colors">
                        {isRegistering ? 'Already have an account? Log in' : "First time? Create your account & 4-digit PIN"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-100">
                      <div>
                        <span className="text-xs font-bold text-indigo-900 truncate max-w-[160px] block">{loggedInClientEmail}</span>
                        {clientPenaltyBalance > 0 && <span className="text-[10px] text-amber-700 font-bold">Pending Penalty: R{clientPenaltyBalance.toFixed(2)}</span>}
                      </div>
                      <button onClick={() => { setClientAuthToken(null); setLoggedInClientEmail(null); setMyBookings([]); setClientPenaltyBalance(0.0); fetchData(); }} className="text-xs text-rose-600 font-bold hover:underline">Log Out</button>
                    </div>

                    <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                      <button
                        onClick={() => setClientTab('active')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${clientTab === 'active' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                      >
                        Active ({myActiveBookings.length})
                      </button>
                      <button
                        onClick={() => setClientTab('completed')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${clientTab === 'completed' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                      >
                        Completed ({myCompletedBookings.length})
                      </button>
                    </div>

                    {clientTab === 'active' ? (
                      myActiveBookings.length === 0 ? (
                        <div className="text-center py-10 px-4 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                          <div className="text-3xl mb-2">📅</div>
                          <p className="text-xs font-bold text-slate-700">No active bookings yet</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Your upcoming appointments will appear here.</p>
                        </div>
                      ) : (
                        <ul className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                          {myActiveBookings.map(apt => (
                            <li key={apt.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 hover:shadow-sm transition-all">
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-bold text-indigo-900">Booking #{apt.id} &bull; {getServiceName(apt.service_id)}</span>
                                <button onClick={() => { setAppointmentToCancel(apt); setCancelModalOpen(true); }} className="text-xs text-rose-600 font-bold bg-rose-50 hover:bg-rose-100 px-3 py-1 rounded-xl border border-rose-200 transition-all">Cancel</button>
                              </div>
                              <p className="text-xs text-slate-700 font-semibold font-mono">{formatZADate(apt.start_time)}</p>
                              <span className="inline-block mt-2 text-[10px] bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-lg font-bold border border-indigo-100">Paid via {apt.payment_method}</span>
                            </li>
                          ))}
                        </ul>
                      )
                    ) : (
                      myCompletedBookings.length === 0 ? (
                        <div className="text-center py-10 px-4 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                          <div className="text-3xl mb-2">⭐</div>
                          <p className="text-xs font-bold text-slate-700">No past bookings found</p>
                        </div>
                      ) : (
                        <ul className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                          {myCompletedBookings.map(apt => (
                            <li key={apt.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-bold text-slate-800">Booking #{apt.id} &bull; {getServiceName(apt.service_id)}</span>
                                <button
                                  onClick={() => setSelectedService(apt.service_id)}
                                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-xl shadow-sm transition-all"
                                >
                                  Book Again
                                </button>
                              </div>
                              <p className="text-[11px] text-slate-500 font-mono">{formatZADate(apt.start_time)}</p>
                            </li>
                          ))}
                        </ul>
                      )
                    )}
                  </div>
                )}
              </div>
            </section>
          </main>
        )}
      </div>

      <footer className="text-center py-8 text-xs text-slate-400 border-t border-slate-200 mt-16 space-y-2 bg-white">
        <p className="font-medium text-slate-500">Pinned! &bull; Portfolio booking demo · South Africa</p>
        <button onClick={() => setPinModalOpen(true)} className="text-indigo-600 font-bold hover:underline bg-transparent border-none cursor-pointer">
          🔒 Business Owner Portal Access
        </button>
      </footer>

      {pinModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <form onSubmit={handleAdminLoginSubmit} className="bg-white rounded-3xl max-w-sm w-full p-8 shadow-2xl border border-slate-100 space-y-5">
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">Admin Authentication</h3>
              <p className="text-xs text-slate-500">Administrator credentials are configured privately on the API server.</p>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">Admin Email</label>
              <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="owner@example.com" required className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs bg-slate-50" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">Password</label>
              <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="••••••••" required className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs bg-slate-50" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">4-Digit Security PIN</label>
              <input type="password" maxLength="4" value={adminPin} onChange={e => setAdminPin(e.target.value)} placeholder="••••" required className="w-full text-center text-xl tracking-[0.5em] font-mono rounded-2xl border border-slate-200 p-3.5 bg-slate-50 font-bold" />
            </div>
            <div className="flex space-x-3 pt-2">
              <button type="button" onClick={() => { setPinModalOpen(false); setAdminEmail(''); setAdminPassword(''); setAdminPin(''); }} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3.5 rounded-2xl text-xs font-bold transition-all">Cancel</button>
              <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-2xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all">Authenticate</button>
            </div>
          </form>
        </div>
      )}

      {ownerCancelModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-slate-100 space-y-5">
            <h3 className="text-xl font-bold text-slate-900">Confirm Owner Cancellation</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Are you sure you want to cancel booking <strong className="text-slate-900">#{appointmentToOwnerCancel?.id}</strong> for <strong className="text-slate-900">{appointmentToOwnerCancel?.client_name}</strong>?
              <br/><br/>
              <span className="text-rose-700 bg-rose-50 p-4 rounded-2xl block border border-rose-100 text-xs font-medium">
                An email is attempted only when Resend is configured. The free/test sender may restrict recipients, delivery is not guaranteed, and no SMS is sent.
              </span>
            </p>
            <div className="flex space-x-3 pt-2">
              <button onClick={() => setOwnerCancelModal(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 py-3.5 rounded-2xl text-xs font-bold text-slate-700 transition-all">Keep Booking</button>
              <button onClick={executeOwnerCancellation} className="flex-1 bg-rose-600 hover:bg-rose-700 py-3.5 rounded-2xl text-xs font-bold text-white shadow-lg shadow-rose-600/30 transition-all">Confirm & Notify</button>
            </div>
          </div>
        </div>
      )}

      {ownerEditModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <form onSubmit={handleOwnerEditSubmit} className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-xl font-bold text-slate-900">Edit Appointment #{appointmentToEdit?.id}</h3>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">Service</label>
              <select value={editServiceId} onChange={e => setEditServiceId(e.target.value)} className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs bg-slate-50">
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name} (R{s.price.toFixed(2)})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">Client Name</label>
              <input type="text" value={editClientName} onChange={e => setEditClientName(e.target.value)} required className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs bg-slate-50" />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">Client Email</label>
              <input type="email" value={editClientEmail} onChange={e => setEditClientEmail(e.target.value)} required className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs bg-slate-50" />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">Client Phone</label>
              <input type="tel" value={editClientPhone} onChange={e => setEditClientPhone(e.target.value)} required className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs bg-slate-50" />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">Date & Time (DD/MM/YYYY)</label>
              <input type="datetime-local" lang="en-ZA" min={minDateTime} value={editStartTime} onChange={e => setEditStartTime(e.target.value)} required className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs bg-slate-50" />
            </div>

            <div className="flex space-x-3 pt-2">
              <button type="button" onClick={() => setOwnerEditModal(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3.5 rounded-2xl text-xs font-bold transition-all">Cancel</button>
              <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-2xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all">Save Changes</button>
            </div>
          </form>
        </div>
      )}

      {forgotModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <form onSubmit={handleForgotSubmit} className="bg-white rounded-3xl max-w-sm w-full p-8 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-xl font-bold text-slate-900">Verify Current Password</h3>
            <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="client@example.com" required className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs bg-slate-50" />
            <input type="password" autoComplete="current-password" value={forgotPassword} onChange={e => setForgotPassword(e.target.value)} placeholder="Current account password" required className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs bg-slate-50" />
            <p className="text-xs leading-relaxed text-slate-500">A secure email recovery flow is not configured for this demo.</p>
            <div className="flex space-x-3 pt-2">
              <button type="button" onClick={() => setForgotModalOpen(false)} className="flex-1 bg-slate-100 text-slate-700 py-3.5 rounded-2xl text-xs font-bold">Cancel</button>
              <button type="submit" className="flex-1 bg-indigo-600 text-white py-3.5 rounded-2xl text-xs font-bold">Verify Identity</button>
            </div>
          </form>
        </div>
      )}

      {resetModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <form onSubmit={handleResetSubmit} className="bg-white rounded-3xl max-w-sm w-full p-8 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-xl font-bold text-slate-900">Set New Credentials</h3>
            <input type="email" value={forgotEmail} disabled className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs bg-slate-100 text-slate-500" />
            <input type="password" autoComplete="new-password" minLength="8" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password (at least 8 characters)" required className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs bg-slate-50" />
            <input type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength="4" value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="New 4-Digit PIN" required className="w-full text-center text-xl tracking-[0.5em] font-mono rounded-2xl border border-slate-200 p-3.5 bg-slate-50 font-bold" />
            <p className="text-xs leading-relaxed text-slate-500">This short-lived reset session expires after your credentials are changed.</p>
            <button type="submit" className="w-full bg-indigo-600 text-white py-3.5 rounded-2xl text-xs font-bold">Update PIN & Password</button>
          </form>
        </div>
      )}

      {cancelModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-slate-100 space-y-5">
            <h3 className="text-xl font-bold text-slate-900">Confirm Cancellation</h3>
            <div className="text-sm text-slate-600 bg-amber-50 border border-amber-200 p-4 rounded-2xl leading-relaxed space-y-2">
              {appointmentToCancel?.payment_method === 'Bank Transfer' ? (
                isLateCancellationModal ? (
                  <p>🏦 <strong className="text-amber-900">Bank Transfer (Within 24h):</strong> Late cancellation incurs a 50% cancellation fee. You are eligible for a <strong>50% refund</strong>.</p>
                ) : (
                  <p>🏦 <strong className="text-amber-900">Bank Transfer (More than 24h before):</strong> Early cancellation incurs no penalty fee. You will receive a <strong>full (100%) refund</strong>.</p>
                )
              ) : (
                isLateCancellationModal ? (
                  <p>⚠️ <strong className="text-amber-900">Cash Payment (Within 24h):</strong> Late cancellation will flag your account. A <strong>50% penalty fee</strong> will be automatically added to your next booking/cash payment.</p>
                ) : (
                  <p>💵 <strong className="text-amber-900">Cash Payment (More than 24h before):</strong> Early cancellation incurs <strong>no penalty fee</strong> and your account will not be flagged.</p>
                )
              )}
            </div>
            <div className="flex space-x-3 pt-2">
              <button onClick={() => setCancelModalOpen(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 py-3.5 rounded-2xl text-xs font-bold text-slate-700 transition-all">Keep Appointment</button>
              <button onClick={confirmClientCancellation} className="flex-1 bg-rose-600 hover:bg-rose-700 py-3.5 rounded-2xl text-xs font-bold text-white shadow-lg shadow-rose-600/30 transition-all">Yes, Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;