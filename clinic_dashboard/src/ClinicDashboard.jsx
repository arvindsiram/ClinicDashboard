import React, { useEffect, useState, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { CheckCircle, Activity, Phone, Clock, Mail, FileText, Eye } from 'lucide-react'; // Added icons
import './dashboard.css';

// Initialization logic
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const N8N_CANCEL_WEBHOOK = import.meta.env.VITE_N8N_CANCEL_WEBHOOK;
const N8N_DONE_WEBHOOK = import.meta.env.VITE_N8N_DONE_WEBHOOK;

const ClinicDashboard = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr.includes('-')) return new Date(dateStr);
    try {
      const clean = dateStr.replace(/(\d+)(st|nd|rd|th)/i, '$1');
      const dateObj = /\d{4}/.test(clean) 
        ? new Date(clean) 
        : new Date(`${clean} ${new Date().getFullYear()}`);
      return isNaN(dateObj) ? null : dateObj;
    } catch (e) { return null; }
  };

  const fetchAppointments = async () => {
    setLoading(true);
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const futureLimit = new Date();
    futureLimit.setDate(now.getDate() + 20);
    futureLimit.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('appointments')
      // MODIFIED: Added report_url to the select statement
      .select('patient_name, email, phone_number, patient_symptoms, report_url, date, status, start_time')
      .eq('status', 'Scheduled');

    if (!error) {
      const filtered = (data || []).filter(appt => {
        const apptDate = parseDate(appt.date);
        return apptDate >= now && apptDate <= futureLimit;
      });

      const sorted = filtered.sort((a, b) => parseDate(a.date) - parseDate(b.date));
      setAppointments(sorted);
      if (sorted.length > 0 && !selectedDate) setSelectedDate(sorted[0].date);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAppointments(); }, []);

  const grouped = useMemo(() => {
    return appointments.reduce((acc, appt) => {
      acc[appt.date] = [...(acc[appt.date] || []), appt];
      return acc;
    }, {});
  }, [appointments]);

  const handleAction = async (appt, actionType) => {
    if (!window.confirm(`Mark as ${actionType}?`)) return;

    const { error } = await supabase
      .from('appointments')
      .update({ status: actionType })
      .match({ patient_name: appt.patient_name, date: appt.date, start_time: appt.start_time });

    if (!error) {
      const url = actionType === 'Completed' ? N8N_DONE_WEBHOOK : N8N_CANCEL_WEBHOOK;
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          patient_name: appt.patient_name,
          email: appt.email,
          date: appt.date,
          time: appt.start_time,
          status: actionType,
          action_at: new Date().toISOString() 
        })
      }).catch(err => console.error("Webhook trigger failed", err));

      setAppointments(prev => prev.filter(a => a !== appt));
    } else {
      alert("Failed to update status in database.");
    }
  };

  return (
    <div className="dashboard-container">
      <header className="header">
        <h1><Activity className="icon-indigo" /> Clinic Dashboard</h1>
        <p>Active Schedule Management</p>
      </header>

      {loading ? (
        <div className="loading-state">Loading schedule...</div>
      ) : appointments.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon-wrapper"><CheckCircle size={32} /></div>
          <h3>All caught up!</h3>
          <p>No appointments currently scheduled for the next 20 days.</p>
        </div>
      ) : (
        <div className="dashboard-grid">
          <div className="sidebar">
            {Object.keys(grouped).map(date => (
              <button 
                key={date} 
                onClick={() => setSelectedDate(date)}
                className={`date-btn ${selectedDate === date ? 'active' : ''}`}
              >
                <div className="date-btn-content">
                    <span className="date-label">{date}</span>
                    <span className="count-badge">{grouped[date].length}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="main-content">
            <h2>Appointments for {selectedDate}</h2>
            {grouped[selectedDate]?.map((appt, i) => (
              <div key={i} className="appointment-card">
                <div className="patient-info">
                  <h3 className="patient-name">{appt.patient_name}</h3>
                  <div className="contact-info">
                    <span className="contact-item"><Phone size={14}/> {appt.phone_number}</span>
                    <span className="contact-item"><Mail size={14}/> {appt.email}</span>
                  </div>
                  <div className="symptoms-box">
                    <p className="symptoms-label">Symptoms</p>
                    <p className="symptoms-text">{appt.patient_symptoms}</p>
                  </div>

                  {/* ADDED: PDF Report Preview Section */}
                  {appt.report_url && appt.report_url.startsWith('data:application/pdf;base64,') ? (
                    <div className="report-preview-container">
                      <p className="report-label"><FileText size={14} /> Medical Report Preview</p>
                      <iframe
                        src={appt.report_url}
                        title={`Report for ${appt.patient_name}`}
                        className="report-iframe"
                        width="100%"
                        height="300px"
                      ></iframe>
                    </div>
                  ) : (
                    <div className="no-report-box">
                      <p className="no-report-text">No medical report attached.</p>
                    </div>
                  )}
                </div>
                
                <div className="appointment-actions">
                  <div className="time-badge">
                    <Clock size={18} /> {appt.start_time}
                  </div>
                  <div className="btn-group">
                    <button onClick={() => handleAction(appt, 'Cancelled')} className="btn btn-cancel">Cancel</button>
                    <button onClick={() => handleAction(appt, 'Completed')} className="btn btn-done">Done</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClinicDashboard;
